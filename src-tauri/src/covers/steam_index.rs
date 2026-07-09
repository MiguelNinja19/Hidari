use crate::catalog::{normalize_match_text, score_steam_title_match, steam_grid_cover, steam_search_queries_for_title};
use crate::config::{STEAM_GAMES_APPID_MIRROR_URL, STEAM_STORE_APP_LIST_URL, STEAM_WEB_API_KEY_ENV};
use crate::db::open_database_connection;
use crate::dto::SteamAppIndexStatusDto;
use crate::title;
use rusqlite::{params, Connection};
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::AppHandle;

const REFRESH_INTERVAL_SECS: i64 = 7 * 86_400;
const UPDATED_AT_SETTING_KEY: &str = "steam_app_index_updated_at";
const FUZZY_SHORTLIST_LIMIT: usize = 300;
const MIN_FUZZY_SCORE: u32 = 2;
const STORE_APP_LIST_PAGE_SIZE: u32 = 50_000;

static REFRESH_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Deserialize)]
struct MirrorAppEntry {
  appid: u32,
  name: String,
}

#[derive(Debug, Deserialize)]
struct StoreAppListResponse {
  response: StoreAppListInner,
}

#[derive(Debug, Deserialize)]
struct StoreAppListInner {
  #[serde(default)]
  apps: Vec<StoreAppEntry>,
  #[serde(default)]
  have_more_results: bool,
  #[serde(default)]
  last_appid: u32,
}

#[derive(Debug, Deserialize)]
struct StoreAppEntry {
  appid: u32,
  #[serde(alias = "app_name")]
  name: String,
}

/// Filtra entradas que quase nunca são o "jogo principal" que queremos como capa.
fn is_noise_app_name(name: &str) -> bool {
  let lower = name.to_lowercase();
  if lower.trim().is_empty() {
    return true;
  }
  const NOISE_MARKERS: [&str; 11] = [
    "soundtrack",
    "dedicated server",
    "sdk",
    "beta test",
    "playtest",
    "artbook",
    "art book",
    "demo",
    "trailer",
    " ost",
    "benchmark",
  ];
  NOISE_MARKERS.iter().any(|marker| lower.contains(marker))
}

fn steam_http_client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .timeout(Duration::from_secs(120))
    .user_agent("Hidari/1.0")
    .build()
    .map_err(|e| format!("could_not_create_steam_index_client: {e}"))
}

fn steam_web_api_key() -> Option<String> {
  std::env::var(STEAM_WEB_API_KEY_ENV)
    .ok()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
}

async fn fetch_steam_app_list_via_store_service(key: &str) -> Result<Vec<(u32, String)>, String> {
  let client = steam_http_client()?;
  let mut all = Vec::new();
  let mut last_appid = 0u32;

  loop {
    let response = client
      .get(STEAM_STORE_APP_LIST_URL)
      .query(&[
        ("key", key.to_string()),
        ("include_games", "true".to_string()),
        ("include_dlc", "false".to_string()),
        ("include_software", "false".to_string()),
        ("include_videos", "false".to_string()),
        ("include_hardware", "false".to_string()),
        ("max_results", STORE_APP_LIST_PAGE_SIZE.to_string()),
        ("last_appid", last_appid.to_string()),
      ])
      .send()
      .await
      .map_err(|e| format!("steam_store_app_list_request_failed: {e}"))?;

    if !response.status().is_success() {
      return Err(format!("steam_store_app_list_http_{}", response.status()));
    }

    let payload: StoreAppListResponse = response
      .json()
      .await
      .map_err(|e| format!("steam_store_app_list_parse_failed: {e}"))?;

    let page_len = payload.response.apps.len();
    for entry in payload.response.apps {
      if is_noise_app_name(&entry.name) {
        continue;
      }
      all.push((entry.appid, entry.name));
    }

    if !payload.response.have_more_results || page_len == 0 {
      break;
    }
    last_appid = payload.response.last_appid;
    if last_appid == 0 {
      break;
    }
  }

  if all.is_empty() {
    return Err("steam_store_app_list_empty".to_string());
  }
  Ok(all)
}

async fn fetch_steam_app_list_from_mirror() -> Result<Vec<(u32, String)>, String> {
  let client = steam_http_client()?;
  let response = client
    .get(STEAM_GAMES_APPID_MIRROR_URL)
    .send()
    .await
    .map_err(|e| format!("steam_app_list_mirror_request_failed: {e}"))?;

  if !response.status().is_success() {
    return Err(format!("steam_app_list_mirror_http_{}", response.status()));
  }

  let entries: Vec<MirrorAppEntry> = response
    .json()
    .await
    .map_err(|e| format!("steam_app_list_mirror_parse_failed: {e}"))?;

  let apps: Vec<(u32, String)> = entries
    .into_iter()
    .filter(|entry| !is_noise_app_name(&entry.name))
    .map(|entry| (entry.appid, entry.name))
    .collect();

  if apps.is_empty() {
    return Err("steam_app_list_mirror_empty".to_string());
  }
  Ok(apps)
}

async fn fetch_steam_app_list() -> Result<Vec<(u32, String)>, String> {
  if let Some(key) = steam_web_api_key() {
    match fetch_steam_app_list_via_store_service(&key).await {
      Ok(apps) => return Ok(apps),
      Err(error) => eprintln!("steam_store_app_list_failed: {error}"),
    }
  }

  fetch_steam_app_list_from_mirror().await
}

fn store_steam_app_index(conn: &mut Connection, apps: &[(u32, String)]) -> Result<(), String> {
  let tx = conn
    .transaction()
    .map_err(|e| format!("steam_app_index_tx_begin: {e}"))?;

  tx.execute("DELETE FROM steam_app_index", [])
    .map_err(|e| format!("steam_app_index_clear: {e}"))?;

  {
    let mut stmt = tx
      .prepare("INSERT OR REPLACE INTO steam_app_index (app_id, name, name_norm) VALUES (?1, ?2, ?3)")
      .map_err(|e| format!("steam_app_index_prepare: {e}"))?;
    for (app_id, name) in apps {
      let name_norm = normalize_match_text(name);
      if name_norm.is_empty() {
        continue;
      }
      stmt
        .execute(params![app_id, name, name_norm])
        .map_err(|e| format!("steam_app_index_insert: {e}"))?;
    }
  }

  tx.commit()
    .map_err(|e| format!("steam_app_index_tx_commit: {e}"))?;
  Ok(())
}

fn set_updated_at(conn: &Connection, timestamp: i64) {
  let _ = conn.execute(
    "INSERT INTO app_settings (key, value) VALUES (?1, ?2) \
     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    params![UPDATED_AT_SETTING_KEY, timestamp.to_string()],
  );
}

pub fn steam_app_index_last_updated(conn: &Connection) -> Option<i64> {
  crate::db::read_app_setting(conn, UPDATED_AT_SETTING_KEY).and_then(|value| value.parse().ok())
}

pub fn steam_app_index_count(conn: &Connection) -> usize {
  conn
    .query_row("SELECT COUNT(*) FROM steam_app_index", [], |row| {
      row.get::<_, i64>(0)
    })
    .map(|count| count.max(0) as usize)
    .unwrap_or(0)
}

pub fn steam_app_index_is_stale(conn: &Connection) -> bool {
  if steam_app_index_count(conn) == 0 {
    return true;
  }
  match steam_app_index_last_updated(conn) {
    Some(updated_at) => super::precache::now_unix_secs() - updated_at > REFRESH_INTERVAL_SECS,
    None => true,
  }
}

/// Baixa a lista completa de jogos da Steam e substitui o índice local. Bloqueante (chamar em task).
pub async fn fetch_and_store_steam_app_list(app: &AppHandle) -> Result<usize, String> {
  let apps = fetch_steam_app_list().await?;
  let count = apps.len();

  let mut conn = open_database_connection(app)?;
  store_steam_app_index(&mut conn, &apps)?;
  set_updated_at(&conn, super::precache::now_unix_secs());

  Ok(count)
}

/// Dispara atualização em segundo plano se o índice estiver vazio ou desatualizado (> 7 dias).
pub fn maybe_refresh_steam_app_index(app: &AppHandle) {
  let app = app.clone();
  tauri::async_runtime::spawn(async move {
    let needs_refresh = open_database_connection(&app)
      .map(|conn| steam_app_index_is_stale(&conn))
      .unwrap_or(true);
    if !needs_refresh {
      return;
    }
    run_refresh(&app).await;
  });
}

async fn run_refresh(app: &AppHandle) {
  if REFRESH_IN_PROGRESS
    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
    .is_err()
  {
    return;
  }
  match fetch_and_store_steam_app_list(app).await {
    Ok(count) => {
      eprintln!("steam_app_index_refreshed: {count} apps");
      if let Ok(n) = super::precache::bulk_resolve_catalog_covers_from_index(app) {
        if n > 0 {
          eprintln!("catalog_covers_resolved_after_index_refresh: {n}");
        }
      }
    }
    Err(error) => eprintln!("steam_app_index_refresh_failed: {error}"),
  }
  REFRESH_IN_PROGRESS.store(false, Ordering::Release);
}

#[tauri::command]
pub async fn refresh_steam_app_index(app: AppHandle) -> Result<SteamAppIndexStatusDto, String> {
  run_refresh(&app).await;
  get_steam_app_index_status(app)
}

#[tauri::command]
pub fn get_steam_app_index_status(app: AppHandle) -> Result<SteamAppIndexStatusDto, String> {
  let conn = open_database_connection(&app)?;
  Ok(SteamAppIndexStatusDto {
    total_apps: steam_app_index_count(&conn),
    last_updated_at: steam_app_index_last_updated(&conn),
    refreshing: REFRESH_IN_PROGRESS.load(Ordering::Acquire),
  })
}

fn exact_lookup(conn: &Connection, name_norm: &str) -> Option<(u32, String)> {
  conn
    .query_row(
      "SELECT app_id, name FROM steam_app_index WHERE name_norm = ?1 LIMIT 1",
      params![name_norm],
      |row| Ok((row.get::<_, i64>(0)? as u32, row.get::<_, String>(1)?)),
    )
    .ok()
}

fn fuzzy_shortlist(conn: &Connection, like_pattern: &str) -> Vec<(u32, String)> {
  let Ok(mut stmt) = conn.prepare(
    "SELECT app_id, name FROM steam_app_index WHERE name_norm LIKE ?1 LIMIT ?2",
  ) else {
    return Vec::new();
  };
  stmt
    .query_map(
      params![like_pattern, FUZZY_SHORTLIST_LIMIT as i64],
      |row| Ok((row.get::<_, i64>(0)? as u32, row.get::<_, String>(1)?)),
    )
    .map(|rows| rows.flatten().collect())
    .unwrap_or_default()
}

fn best_fuzzy_match(candidates: &[(u32, String)], reference_norm: &str) -> Option<(u32, String)> {
  let mut best: Option<(u32, u32, String)> = None;
  for (app_id, name) in candidates {
    let score = score_steam_title_match(name, reference_norm);
    if score < MIN_FUZZY_SCORE {
      continue;
    }
    if best.as_ref().map(|(best_score, _, _)| score > *best_score).unwrap_or(true) {
      best = Some((score, *app_id, name.clone()));
    }
  }
  best.map(|(_, app_id, name)| (app_id, name))
}

/// Procura o AppID Steam no índice local (sem rede). Instantâneo.
pub fn lookup_steam_app_id_local(conn: &Connection, title: &str) -> Option<(u32, String)> {
  let queries = steam_search_queries_for_title(title);
  if queries.is_empty() {
    return None;
  }

  for query in &queries {
    let norm = normalize_match_text(query);
    if norm.is_empty() {
      continue;
    }
    if let Some(hit) = exact_lookup(conn, &norm) {
      return Some(hit);
    }
  }

  let reference_norm = normalize_match_text(&title::clean_title_for_matching(title));
  if reference_norm.is_empty() {
    return None;
  }

  let first_word = reference_norm
    .split_whitespace()
    .find(|word| word.len() >= 4)
    .or_else(|| reference_norm.split_whitespace().next())?;

  let prefix_pattern = format!("{first_word}%");
  let mut candidates = fuzzy_shortlist(conn, &prefix_pattern);
  if let Some(hit) = best_fuzzy_match(&candidates, &reference_norm) {
    return Some(hit);
  }

  let contains_pattern = format!("%{first_word}%");
  candidates = fuzzy_shortlist(conn, &contains_pattern);
  best_fuzzy_match(&candidates, &reference_norm)
}

/// Resolve a URL de capa a partir do índice local — instantâneo, sem chamada de rede.
pub fn resolve_cover_via_local_index(conn: &Connection, title: &str) -> Option<String> {
  let (app_id, _matched_name) = lookup_steam_app_id_local(conn, title)?;
  Some(steam_grid_cover(app_id))
}

/// Lookup rápido só por correspondência exacta — evita fuzzy LIKE no caminho quente da pesquisa.
pub fn resolve_cover_via_local_index_exact(conn: &Connection, title: &str) -> Option<String> {
  for query in steam_search_queries_for_title(title) {
    let norm = normalize_match_text(&query);
    if norm.is_empty() {
      continue;
    }
    if let Some((app_id, _)) = exact_lookup(conn, &norm) {
      return Some(steam_grid_cover(app_id));
    }
  }
  None
}

#[cfg(test)]
mod tests {
  use super::*;

  fn test_conn() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        "CREATE TABLE steam_app_index (
          app_id    INTEGER PRIMARY KEY,
          name      TEXT NOT NULL,
          name_norm TEXT NOT NULL
        );
        CREATE INDEX idx_steam_app_index_name_norm ON steam_app_index(name_norm);
        CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
      )
      .unwrap();
    conn
  }

  fn seed(conn: &Connection, app_id: u32, name: &str) {
    conn
      .execute(
        "INSERT INTO steam_app_index (app_id, name, name_norm) VALUES (?1, ?2, ?3)",
        params![app_id, name, normalize_match_text(name)],
      )
      .unwrap();
  }

  #[test]
  fn filters_soundtrack_and_demo_noise() {
    assert!(is_noise_app_name("Hades Original Soundtrack"));
    assert!(is_noise_app_name("Some Game Demo"));
    assert!(!is_noise_app_name("Hades"));
  }

  #[test]
  fn exact_match_finds_clean_title() {
    let conn = test_conn();
    seed(&conn, 1145360, "Hades");
    let hit = lookup_steam_app_id_local(&conn, "Hades");
    assert_eq!(hit.map(|(id, _)| id), Some(1145360));
  }

  #[test]
  fn fuzzy_match_finds_noisy_repack_title() {
    let conn = test_conn();
    seed(&conn, 1145360, "Hades");
    let hit = lookup_steam_app_id_local(&conn, "Hades - v1.2 - FitGirl Repack");
    assert_eq!(hit.map(|(id, _)| id), Some(1145360));
  }

  #[test]
  fn returns_none_when_no_plausible_match() {
    let conn = test_conn();
    seed(&conn, 1145360, "Hades");
    assert!(lookup_steam_app_id_local(&conn, "Completely Unrelated Game XYZ").is_none());
  }
}
