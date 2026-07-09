use super::{
  clear_cover_precache_skips, download_and_cache_cover, is_usable_cover_file,
  mark_cover_resolve_skip, should_skip_cover_resolve, upsert_game_cover,
};
use crate::catalog::{embedded_cover_for_title, fetch_steam_cover_url_for_title};
use crate::covers::steam_index;
use crate::db::open_database_connection;
use crate::dto::CoverPrecacheStatusDto;
use crate::title;
use rusqlite::Connection;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::sleep;

const STEAM_LOOKUP_DELAY_MS: u64 = 220;
const PROGRESS_EMIT_EVERY: usize = 3;
const BATCH_RESOLVE_MAX: usize = 200;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverPrecacheSnapshot {
  pub running: bool,
  pub total: usize,
  pub processed: usize,
  pub cached: usize,
  pub downloaded: usize,
  pub unresolved: usize,
  pub failed: usize,
}

#[derive(Clone)]
pub struct CoverPrecacheState {
  cancel: Arc<AtomicBool>,
  worker_running: Arc<AtomicBool>,
  rerun_requested: Arc<AtomicBool>,
  snapshot: Arc<Mutex<CoverPrecacheSnapshot>>,
}

impl Default for CoverPrecacheState {
  fn default() -> Self {
    Self {
      cancel: Arc::new(AtomicBool::new(false)),
      worker_running: Arc::new(AtomicBool::new(false)),
      rerun_requested: Arc::new(AtomicBool::new(false)),
      snapshot: Arc::new(Mutex::new(CoverPrecacheSnapshot::default())),
    }
  }
}

impl CoverPrecacheState {
  pub fn status(&self) -> CoverPrecacheStatusDto {
    let snap = self.snapshot.lock().unwrap().clone();
    CoverPrecacheStatusDto {
      running: snap.running,
      total: snap.total,
      processed: snap.processed,
      cached: snap.cached,
      downloaded: snap.downloaded,
      unresolved: snap.unresolved,
      failed: snap.failed,
    }
  }

  fn set_snapshot(&self, update: impl FnOnce(&mut CoverPrecacheSnapshot)) {
    let mut snap = self.snapshot.lock().unwrap();
    update(&mut snap);
  }
}

fn covers_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
  super::covers_dir_for_app(app)
}

fn distinct_catalog_titles(conn: &Connection) -> Result<Vec<String>, String> {
  let mut stmt = conn
    .prepare("SELECT DISTINCT title FROM hydra_catalog_entries ORDER BY title COLLATE NOCASE")
    .map_err(|e| format!("could_not_prepare_catalog_titles: {e}"))?;
  let rows = stmt
    .query_map([], |row| row.get::<_, String>(0))
    .map_err(|e| format!("could_not_query_catalog_titles: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_catalog_titles: {e}"))?;
  Ok(rows)
}

fn cached_title_keys(conn: &Connection, covers_dir: &Path) -> Result<HashSet<String>, String> {
  let mut stmt = conn
    .prepare("SELECT title_key, local_path FROM game_covers WHERE local_path IS NOT NULL")
    .map_err(|e| format!("could_not_prepare_cached_covers: {e}"))?;
  let mut keys = HashSet::new();
  for row in stmt
    .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)))
    .map_err(|e| format!("could_not_query_cached_covers: {e}"))?
    .flatten()
  {
    let (key, path) = row;
    if path
      .as_ref()
      .is_some_and(|p| is_usable_cover_file(Path::new(p), covers_dir))
    {
      keys.insert(key);
    }
  }
  Ok(keys)
}

fn titles_pending_precache(
  conn: &Connection,
  covers_dir: &Path,
) -> Result<Vec<String>, String> {
  let all = distinct_catalog_titles(conn)?;
  let cached = cached_title_keys(conn, covers_dir)?;
  let mut pending = Vec::new();
  for title in all {
    let key = title::normalize_title_key(&title);
    if key.is_empty() || cached.contains(&key) {
      continue;
    }
    if should_skip_cover_resolve(conn, &key) {
      continue;
    }
    pending.push(title);
  }
  Ok(pending)
}

pub fn count_catalog_titles(conn: &Connection) -> Result<usize, String> {
  conn
    .query_row(
      "SELECT COUNT(DISTINCT title) FROM hydra_catalog_entries",
      [],
      |row| row.get(0),
    )
    .map_err(|e| format!("could_not_count_catalog_titles: {e}"))
}

pub fn count_cached_covers(conn: &Connection, covers_dir: &Path) -> Result<usize, String> {
  Ok(cached_title_keys(conn, covers_dir)?.len())
}

async fn resolve_cover_url_for_title(app: &AppHandle, title: &str) -> Option<String> {
  if let Some(url) = embedded_cover_for_title(title) {
    return Some(url);
  }
  if let Ok(conn) = open_database_connection(app) {
    if let Some(url) = steam_index::resolve_cover_via_local_index(&conn, title) {
      return Some(url);
    }
  }
  sleep(Duration::from_millis(STEAM_LOOKUP_DELAY_MS)).await;
  fetch_steam_cover_url_for_title(title).await
}

fn emit_progress(app: &AppHandle, state: &CoverPrecacheState) {
  let payload = state.status();
  let _ = app.emit("cover-precache-progress", payload);
}

pub async fn run_cover_precache(app: AppHandle, state: CoverPrecacheState) {
  loop {
    if state
      .worker_running
      .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
      .is_err()
    {
      return;
    }

    state.cancel.store(false, Ordering::Release);
    run_cover_precache_once(app.clone(), state.clone()).await;

    if !state.rerun_requested.swap(false, Ordering::AcqRel) {
      break;
    }
  }
}

async fn run_cover_precache_once(app: AppHandle, state: CoverPrecacheState) {
  let work = match open_database_connection(&app).and_then(|conn| {
    let dir = covers_dir(&app)?;
    titles_pending_precache(&conn, &dir)
  }) {
    Ok(items) => items,
    Err(error) => {
      eprintln!("cover_precache_init_failed: {error}");
      state.worker_running.store(false, Ordering::Release);
      state.set_snapshot(|snap| snap.running = false);
      emit_progress(&app, &state);
      return;
    }
  };

  let total = work.len();
  state.set_snapshot(|snap| {
    *snap = CoverPrecacheSnapshot {
      running: true,
      total,
      ..CoverPrecacheSnapshot::default()
    };
  });
  emit_progress(&app, &state);

  if total == 0 {
    state.set_snapshot(|snap| snap.running = false);
    state.worker_running.store(false, Ordering::Release);
    emit_progress(&app, &state);
    return;
  }

  let covers_dir = match covers_dir(&app) {
    Ok(dir) => dir,
    Err(error) => {
      eprintln!("cover_precache_dir_failed: {error}");
      state.set_snapshot(|snap| snap.running = false);
      state.worker_running.store(false, Ordering::Release);
      emit_progress(&app, &state);
      return;
    }
  };

  for (index, title) in work.into_iter().enumerate() {
    if state.cancel.load(Ordering::Acquire) {
      break;
    }

    let title_key = title::normalize_title_key(&title);
    let mut outcome_cached = false;
    let mut outcome_downloaded = false;
    let mut outcome_unresolved = false;
    let mut outcome_failed = false;

    if let Ok(conn) = open_database_connection(&app) {
      if let Some((cover_url, local_path)) = super::lookup_cover_row_for_title(&conn, &title) {
        if local_path
          .as_ref()
          .is_some_and(|p| is_usable_cover_file(Path::new(p), &covers_dir))
        {
          outcome_cached = true;
        } else if !cover_url.trim().is_empty() {
          match download_and_cache_cover(&app, &title, &cover_url).await {
            Ok(Some(_)) => outcome_downloaded = true,
            Ok(None) => outcome_failed = true,
            Err(_) => outcome_failed = true,
          }
        }
      }
    }

    if !outcome_cached && !outcome_downloaded && !outcome_failed {
      match resolve_cover_url_for_title(&app, &title).await {
        Some(url) => {
          if let Ok(conn) = open_database_connection(&app) {
            let _ = upsert_game_cover(&conn, &title, &url);
          }
          match download_and_cache_cover(&app, &title, &url).await {
            Ok(Some(_)) => outcome_downloaded = true,
            Ok(None) => outcome_failed = true,
            Err(_) => outcome_failed = true,
          }
        }
        None => {
          if let Ok(conn) = open_database_connection(&app) {
            mark_cover_resolve_skip(&conn, &title_key);
          }
          outcome_unresolved = true;
        }
      }
    }

    state.set_snapshot(|snap| {
      snap.processed += 1;
      if outcome_cached {
        snap.cached += 1;
      } else if outcome_downloaded {
        snap.downloaded += 1;
      } else if outcome_unresolved {
        snap.unresolved += 1;
      } else if outcome_failed {
        snap.failed += 1;
      }
    });

    if index % PROGRESS_EMIT_EVERY == PROGRESS_EMIT_EVERY - 1 || index + 1 == total {
      emit_progress(&app, &state);
    }
  }

  state.set_snapshot(|snap| snap.running = false);
  state.worker_running.store(false, Ordering::Release);
  emit_progress(&app, &state);
}

pub fn spawn_cover_precache(app: AppHandle, state: CoverPrecacheState) {
  tauri::async_runtime::spawn(async move {
    run_cover_precache(app, state).await;
  });
}

pub fn maybe_start_cover_precache(app: &AppHandle) {
  let Some(state) = app.try_state::<CoverPrecacheState>() else {
    return;
  };
  if state.worker_running.load(Ordering::Acquire) {
    state.rerun_requested.store(true, Ordering::Release);
    return;
  }
  spawn_cover_precache(app.clone(), state.inner().clone());
}

#[tauri::command]
pub fn retry_unresolved_covers(
  app: AppHandle,
  state: tauri::State<'_, CoverPrecacheState>,
) -> Result<CoverPrecacheStatusDto, String> {
  let conn = open_database_connection(&app)?;
  clear_cover_precache_skips(&conn)?;
  drop(conn);
  maybe_start_cover_precache(&app);
  Ok(state.status())
}

#[tauri::command]
pub fn get_cover_precache_status(state: tauri::State<'_, CoverPrecacheState>) -> CoverPrecacheStatusDto {
  state.status()
}

#[tauri::command]
pub fn start_cover_precache(
  app: AppHandle,
  state: tauri::State<'_, CoverPrecacheState>,
) -> CoverPrecacheStatusDto {
  if state.worker_running.load(Ordering::Acquire) {
    return state.status();
  }
  spawn_cover_precache(app, state.inner().clone());
  state.status()
}

#[tauri::command]
pub fn stop_cover_precache(state: tauri::State<'_, CoverPrecacheState>) -> CoverPrecacheStatusDto {
  state.cancel.store(true, Ordering::Release);
  state.status()
}

/// Estatísticas rápidas para a UI (sem percorrer todo o catálogo).
#[tauri::command]
pub fn get_cover_cache_stats(app: AppHandle) -> Result<CoverPrecacheStatusDto, String> {
  let conn = open_database_connection(&app)?;
  let covers_dir = covers_dir(&app)?;
  let total = count_catalog_titles(&conn)?;
  let cached = count_cached_covers(&conn, &covers_dir)?;
  let unresolved = super::count_active_cover_skips(&conn).unwrap_or(0);
  Ok(CoverPrecacheStatusDto {
    running: false,
    total,
    processed: cached,
    cached,
    downloaded: 0,
    unresolved,
    failed: 0,
  })
}

/// Resolve URL persistida + embedded; Steam só se necessário.
pub async fn resolve_cover_url(app: &AppHandle, title: &str) -> Option<String> {
  let trimmed = title.trim();
  if trimmed.is_empty() {
    return None;
  }
  let title_key = title::normalize_title_key(trimmed);

  let mut local_index_hit: Option<String> = None;
  if let Ok(conn) = open_database_connection(app) {
    if let Some((url, _)) = super::lookup_cover_row_for_title(&conn, trimmed) {
      if !url.trim().is_empty() {
        return Some(url);
      }
    }
    if should_skip_cover_resolve(&conn, &title_key) {
      return None;
    }
    local_index_hit = steam_index::resolve_cover_via_local_index(&conn, trimmed);
  }

  let resolved = if let Some(url) = embedded_cover_for_title(trimmed) {
    Some(url)
  } else if let Some(url) = local_index_hit {
    Some(url)
  } else if let Some(url) = fetch_steam_cover_url_for_title(trimmed).await {
    Some(url)
  } else {
    None
  };

  if let Ok(conn) = open_database_connection(app) {
    if let Some(ref url) = resolved {
      let _ = upsert_game_cover(&conn, trimmed, url);
    } else {
      mark_cover_resolve_skip(&conn, &title_key);
    }
  }

  resolved
}

/// Resolve capa só com fontes locais (embutido + índice Steam) — instantâneo, sem rede.
pub fn resolve_cover_url_local(conn: &Connection, title: &str) -> Option<String> {
  let trimmed = title.trim();
  if trimmed.is_empty() {
    return None;
  }
  if let Some(url) = embedded_cover_for_title(trimmed) {
    return Some(url);
  }
  steam_index::resolve_cover_via_local_index(conn, trimmed)
}

/// Após import/sync ou refresh do índice: grava `cover_url` para todo o catálogo via lookup local.
pub fn bulk_resolve_catalog_covers_from_index(app: &AppHandle) -> Result<usize, String> {
  let conn = open_database_connection(app)?;
  if steam_index::steam_app_index_count(&conn) == 0 {
    return Ok(0);
  }

  let mut stmt = conn
    .prepare("SELECT DISTINCT title FROM hydra_catalog_entries")
    .map_err(|e| format!("bulk_resolve_prepare: {e}"))?;
  let titles = stmt
    .query_map([], |row| row.get::<_, String>(0))
    .map_err(|e| format!("bulk_resolve_query: {e}"))?
    .filter_map(Result::ok)
    .collect::<Vec<_>>();

  let mut resolved = 0usize;
  for title in titles {
    let title_key = title::normalize_title_key(&title);
    if title_key.is_empty() {
      continue;
    }
    if let Some((url, _)) = super::lookup_cover_row_for_title(&conn, &title) {
      if super::is_plausible_cover_url(&url) {
        continue;
      }
    }
    let Some(url) = resolve_cover_url_local(&conn, &title) else {
      continue;
    };
    let _ = super::upsert_game_cover(&conn, &title, &url)?;
    resolved += 1;
  }
  Ok(resolved)
}

pub fn attach_cover_urls_to_games(app: &AppHandle, games: &mut [crate::dto::CatalogGameDto]) {
  if games.is_empty() {
    return;
  }
  let Ok(conn) = open_database_connection(app) else {
    return;
  };
  let Ok(covers_dir) = covers_dir(app) else {
    return;
  };

  let keys: Vec<String> = games
    .iter()
    .map(|game| title::normalize_title_key(&game.title))
    .filter(|key| !key.is_empty())
    .collect();

  let stored = batch_lookup_cover_rows(&conn, &keys, &covers_dir);

  for game in games.iter_mut() {
    let key = title::normalize_title_key(&game.title);
    if let Some(row) = stored.get(&key) {
      if game
        .cover_url
        .as_ref()
        .is_none_or(|url| url.trim().is_empty())
      {
        game.cover_url = Some(row.url.clone());
      }
      if row.local_path.is_some() {
        game.local_cover_path = row.local_path.clone();
      }
      continue;
    }
    if game
      .cover_url
      .as_ref()
      .is_some_and(|url| !url.trim().is_empty())
    {
      continue;
    }
    if let Some(url) = embedded_cover_for_title(&game.title) {
      game.cover_url = Some(url);
      continue;
    }
    if let Some(url) = steam_index::resolve_cover_via_local_index_exact(&conn, &game.title) {
      game.cover_url = Some(url);
    }
  }
}

#[derive(Clone)]
pub(crate) struct CoverBatchRow {
  url: String,
  local_path: Option<String>,
}

pub(crate) fn batch_lookup_cover_rows(
  conn: &Connection,
  keys: &[String],
  covers_dir: &Path,
) -> HashMap<String, CoverBatchRow> {
  let mut out = HashMap::new();
  for chunk in keys.chunks(120) {
    let placeholders = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
      "SELECT title_key, cover_url, local_path FROM game_covers WHERE title_key IN ({placeholders})"
    );
    let Ok(mut stmt) = conn.prepare(&sql) else {
      continue;
    };
    let params: Vec<&dyn rusqlite::ToSql> = chunk
      .iter()
      .map(|key| key as &dyn rusqlite::ToSql)
      .collect();
    let Ok(rows) = stmt.query_map(params.as_slice(), |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, Option<String>>(2)?,
      ))
    }) else {
      continue;
    };
    for row in rows.flatten() {
      let (key, url, local) = row;
      if !super::is_plausible_cover_url(&url) {
        continue;
      }
      let local_path = local.and_then(|path| {
        if is_usable_cover_file(Path::new(&path), covers_dir) {
          Some(path)
        } else {
          None
        }
      });
      out.insert(key, CoverBatchRow { url, local_path });
    }
  }
  out
}

async fn resolve_cover_batch_item(
  app: &AppHandle,
  title: String,
) -> crate::dto::ResolvedCoverBatchItem {
  let trimmed = title.trim().to_string();
  let covers_dir = match covers_dir(app) {
    Ok(dir) => dir,
    Err(_) => {
      return crate::dto::ResolvedCoverBatchItem {
        title: trimmed,
        cover_url: None,
        local_cover_path: None,
      };
    }
  };

  if let Ok(conn) = open_database_connection(app) {
    if let Some((url, local)) = super::lookup_cover_row_for_title(&conn, &trimmed) {
      let local_cover_path = local.filter(|path| is_usable_cover_file(Path::new(path), &covers_dir));
      return crate::dto::ResolvedCoverBatchItem {
        title: trimmed,
        cover_url: Some(url),
        local_cover_path,
      };
    }

    if let Some(url) = resolve_cover_url_local(&conn, &trimmed) {
      let _ = upsert_game_cover(&conn, &trimmed, &url);
      return crate::dto::ResolvedCoverBatchItem {
        title: trimmed,
        cover_url: Some(url),
        local_cover_path: None,
      };
    }
  }

  let cover_url = resolve_cover_url(app, &trimmed).await;
  let local_cover_path = if cover_url.is_some() {
    open_database_connection(app)
      .ok()
      .and_then(|conn| super::lookup_cover_row_for_title(&conn, &trimmed))
      .and_then(|(_, local)| local)
      .filter(|path| is_usable_cover_file(Path::new(path), &covers_dir))
  } else {
    None
  };

  crate::dto::ResolvedCoverBatchItem {
    title: trimmed,
    cover_url,
    local_cover_path,
  }
}

/// Resolve capas para vários títulos: índice local primeiro (rápido), rede só para o restante.
#[tauri::command]
pub async fn resolve_covers_for_titles(
  app: AppHandle,
  titles: Vec<String>,
) -> Result<Vec<crate::dto::ResolvedCoverBatchItem>, String> {
  let unique: Vec<String> = titles
    .into_iter()
    .map(|title| title.trim().to_string())
    .filter(|title| title.len() >= 2)
    .collect::<HashSet<_>>()
    .into_iter()
    .take(BATCH_RESOLVE_MAX)
    .collect();

  if unique.is_empty() {
    return Ok(Vec::new());
  }

  let covers_dir = covers_dir(&app)?;
  let conn = open_database_connection(&app)?;
  let mut out = Vec::with_capacity(unique.len());
  let mut needs_network = Vec::new();

  let mut lookup_keys: Vec<String> = Vec::new();
  let mut title_keys: Vec<(String, String, String)> = Vec::with_capacity(unique.len());
  for title in &unique {
    let key = crate::title::normalize_title_key(title);
    let group = crate::title::catalog_game_group_key(title);
    lookup_keys.push(key.clone());
    if group != key {
      lookup_keys.push(group.clone());
    }
    title_keys.push((title.clone(), key, group));
  }
  lookup_keys.sort_unstable();
  lookup_keys.dedup();

  let batch = batch_lookup_cover_rows(&conn, &lookup_keys, &covers_dir);

  for (title, key, group) in title_keys {
    let row = batch
      .get(&key)
      .or_else(|| batch.get(&group));
    if let Some(row) = row {
      out.push(crate::dto::ResolvedCoverBatchItem {
        title: title.clone(),
        cover_url: Some(row.url.clone()),
        local_cover_path: row.local_path.clone(),
      });
      continue;
    }
    if let Some(url) = resolve_cover_url_local(&conn, &title) {
      let _ = upsert_game_cover(&conn, &title, &url);
      out.push(crate::dto::ResolvedCoverBatchItem {
        title: title.clone(),
        cover_url: Some(url),
        local_cover_path: None,
      });
      continue;
    }
    needs_network.push(title);
  }

  drop(conn);

  if needs_network.is_empty() {
    return Ok(out);
  }

  let mut join_set = tokio::task::JoinSet::new();
  let max_in_flight = 3usize;

  for title in needs_network {
    while join_set.len() >= max_in_flight {
      if let Some(Ok(item)) = join_set.join_next().await {
        out.push(item);
      }
    }
    let app_bg = app.clone();
    join_set.spawn(async move { resolve_cover_batch_item(&app_bg, title).await });
  }

  while let Some(result) = join_set.join_next().await {
    if let Ok(item) = result {
      out.push(item);
    }
  }

  Ok(out)
}

pub fn now_unix_secs() -> i64 {
  i64::try_from(
    SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap_or_default()
      .as_secs(),
  )
  .unwrap_or(0)
}
