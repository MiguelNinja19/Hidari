mod archive;
mod launch;

use regex::Regex;
use rusqlite::OptionalExtension;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_notification::NotificationExt;
use tokio::time::{sleep, Duration};
use url::Url;

const DOWNLOAD_EVENT_PROGRESS: &str = "download://progress";
const QUEUE_EVENT_JOB_PROGRESS: &str = "queue://job-progress";
const APP_EVENT_DEEP_LINK: &str = "app://deep-link";
const EXTRACT_EVENT_STATUS: &str = "extract://status";

// ── Sidecar State ─────────────────────────────────────────────────────────────

#[derive(Default)]
struct SidecarState {
  port: Mutex<Option<u16>>,
  booting: Mutex<bool>,
}

#[derive(Default)]
struct ExtractionState {
  busy: Mutex<bool>,
}

impl ExtractionState {
  fn try_acquire(&self) -> bool {
    let mut guard = self.busy.lock().unwrap();
    if *guard {
      return false;
    }
    *guard = true;
    true
  }

  fn release(&self) {
    *self.busy.lock().unwrap() = false;
  }
}

impl SidecarState {
  fn get_port(&self) -> Option<u16> {
    *self.port.lock().unwrap()
  }

  fn set_port(&self, port: u16) {
    *self.port.lock().unwrap() = Some(port);
  }

  fn clear_port(&self) {
    *self.port.lock().unwrap() = None;
  }

  fn is_booting(&self) -> bool {
    *self.booting.lock().unwrap()
  }

  fn set_booting(&self, booting: bool) {
    *self.booting.lock().unwrap() = booting;
  }
}

// ── Managed State ─────────────────────────────────────────────────────────────

struct QueueManager {
  active_job_id: Arc<Mutex<Option<i64>>>,
  should_cancel: Arc<Mutex<bool>>,
  should_pause: Arc<Mutex<bool>>,
}

impl QueueManager {
  fn new() -> Self {
    Self {
      active_job_id: Arc::new(Mutex::new(None)),
      should_cancel: Arc::new(Mutex::new(false)),
      should_pause: Arc::new(Mutex::new(false)),
    }
  }
}

// ── DTOs: System ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PathsPayload {
  app_data_dir: String,
  app_config_dir: String,
  app_cache_dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalLibraryItemDto {
  name: String,
  path: String,
  is_dir: bool,
  size_bytes: u64,
  modified_at: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteLocalLibraryItemPayload {
  path: String,
}

// ── DTOs: Sources ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddSourcePayload {
  name: String,
  base_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddDownloadSourcePayload {
  url: String,
}

#[derive(Debug, Deserialize)]
struct RemoveSourcePayload {
  id: i64,
}

#[derive(Debug, Deserialize)]
struct RemoveHydraSourcePayload {
  id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceDto {
  id: i64,
  name: String,
  base_url: String,
  status: String,
  created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HydraSourceDto {
  id: String,
  name: String,
  url: String,
  status: String,
  download_count: i64,
  fingerprint: Option<String>,
  created_at: String,
}

#[derive(Debug, Deserialize)]
struct TestSourcePayload {
  id: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TestSourceResultDto {
  source_id: i64,
  ok: bool,
  status_code: Option<u16>,
  latency_ms: u128,
  message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GameSourceChangeDto {
  game_id: i64,
  new_download_options_count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchGameOptionsPayload {
  game_id: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadOptionDto {
  source_id: String,
  source_name: String,
  title: String,
  download_type: String,
  url: String,
  quality: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  cover_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchDownloadOptionsPayload {
  query: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchCatalogPayload {
  query: String,
  include_steam: Option<bool>,
  only_with_sources: Option<bool>,
}

#[derive(Debug, Deserialize, Clone)]
struct EmbeddedCatalogEntry {
  title: String,
  genre: String,
  steam_app_id: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CatalogGameDto {
  id: String,
  title: String,
  genre: String,
  cover_url: Option<String>,
  source: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetDefaultDownloadPathPayload {
  path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetSeedTorrentsEnabledPayload {
  enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetAppSettingPayload {
  key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetAppSettingPayload {
  key: String,
  value: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiskPathPayload {
  path: String,
}

#[derive(Debug, Clone)]
struct SourceEntry {
  id: i64,
  name: String,
  base_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceOptionItem {
  title: Option<String>,
  url: String,
  #[serde(alias = "download_type")]
  download_type: Option<String>,
  quality: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SourceSearchResponse {
  options: Vec<SourceOptionItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HydraChangesResponseItem {
  shop: String,
  object_id: String,
  new_download_options_count: i64,
}

// ── DTOs: Games ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddGamePayload {
  title: String,
  install_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateGamePayload {
  id: i64,
  title: String,
  install_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToggleFavoritePayload {
  id: i64,
  favorite: bool,
}

#[derive(Debug, Deserialize)]
struct RemoveGamePayload {
  id: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GameDto {
  id: i64,
  title: String,
  install_path: String,
  is_favorite: bool,
  new_download_options_count: i64,
  created_at: String,
}

// ── DTOs: Mock Download (legacy) ──────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartMockDownloadPayload {
  download_id: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadProgressPayload {
  download_id: String,
  progress: u8,
  speed_bytes_per_sec: u64,
  eta_seconds: u64,
  status: String,
}

// ── DTOs: Queue ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EnqueueJobPayload {
  title: String,
  url: String,
  dest_path: String,
  priority: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct JobIdPayload {
  id: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadJobDto {
  id: i64,
  title: String,
  url: String,
  dest_path: String,
  status: String,
  priority: i64,
  progress: i64,
  bytes_downloaded: i64,
  total_bytes: i64,
  error_msg: Option<String>,
  created_at: String,
  updated_at: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct JobProgressEvent {
  job_id: String,
  progress: f64,
  status: String,
  speed_bytes_per_sec: u64,
  eta_seconds: i64,
  #[serde(skip_serializing_if = "Option::is_none")]
  bytes_downloaded: Option<i64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  total_bytes: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DeepLinkEventPayload {
  url: String,
  game_id: Option<String>,
  action: Option<String>,
}

// ── Commands: System ──────────────────────────────────────────────────────────

#[tauri::command]
fn ping() -> &'static str {
  "pong"
}

#[tauri::command]
fn app_version(app: AppHandle) -> String {
  app.package_info().version.to_string()
}

#[tauri::command]
fn get_paths(app: AppHandle) -> Result<PathsPayload, String> {
  let data = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("could_not_get_app_data_dir: {e}"))?;
  let config = app
    .path()
    .app_config_dir()
    .map_err(|e| format!("could_not_get_app_config_dir: {e}"))?;
  let cache = app
    .path()
    .app_cache_dir()
    .map_err(|e| format!("could_not_get_app_cache_dir: {e}"))?;
  Ok(PathsPayload {
    app_data_dir: data.to_string_lossy().to_string(),
    app_config_dir: config.to_string_lossy().to_string(),
    app_cache_dir: cache.to_string_lossy().to_string(),
  })
}

// ── Commands: Sources ─────────────────────────────────────────────────────────

#[tauri::command]
fn add_source(app: AppHandle, payload: AddSourcePayload) -> Result<SourceDto, String> {
  validate_source_url(&payload.base_url)?;
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "INSERT INTO download_sources (name, base_url, status) VALUES (?1, ?2, 'active')",
      params![payload.name, payload.base_url],
    )
    .map_err(|e| format!("could_not_insert_source: {e}"))?;
  fetch_source_by_id(&conn, conn.last_insert_rowid())
}

#[tauri::command]
fn list_sources(app: AppHandle) -> Result<Vec<SourceDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare(
      "SELECT id, name, base_url, status, created_at FROM download_sources ORDER BY id DESC",
    )
    .map_err(|e| format!("could_not_prepare_list_sources: {e}"))?;
  let result = stmt
    .query_map([], |row| {
      Ok(SourceDto {
        id: row.get(0)?,
        name: row.get(1)?,
        base_url: row.get(2)?,
        status: row.get(3)?,
        created_at: row.get(4)?,
      })
    })
    .map_err(|e| format!("could_not_query_sources: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_sources: {e}"));
  result
}

#[tauri::command]
fn remove_source(app: AppHandle, payload: RemoveSourcePayload) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute("DELETE FROM download_sources WHERE id = ?1", params![payload.id])
    .map_err(|e| format!("could_not_remove_source: {e}"))?;
  Ok(())
}

#[tauri::command]
async fn test_download_source(
  app: AppHandle,
  payload: TestSourcePayload,
) -> Result<TestSourceResultDto, String> {
  let conn = open_database_connection(&app)?;
  let source = load_source_by_id(&conn, payload.id)?;
  drop(conn);

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(8))
    .build()
    .map_err(|error| format!("could_not_create_http_client: {error}"))?;

  let base = source.base_url.trim_end_matches('/');
  let started = std::time::Instant::now();

  // Primeiro tenta health, fallback para search.
  let primary = client.get(format!("{base}/health")).send().await;
  let response = match primary {
    Ok(resp) => Ok(("health".to_string(), resp)),
    Err(_) => client
      .get(format!("{base}/search"))
      .query(&[("query", "test"), ("gameId", "0")])
      .send()
      .await
      .map(|resp| ("search".to_string(), resp)),
  };

  match response {
    Ok((path_used, resp)) => {
      let latency = started.elapsed().as_millis();
      let code = resp.status().as_u16();
      let ok = resp.status().is_success();
      let status = if ok { "active" } else { "failed" };
      set_source_status(&app, source.id, status);

      Ok(TestSourceResultDto {
        source_id: source.id,
        ok,
        status_code: Some(code),
        latency_ms: latency,
        message: if ok {
          format!("Conexao ok via /{path_used}")
        } else {
          format!("Fonte respondeu com HTTP {code} em /{path_used}")
        },
      })
    }
    Err(error) => {
      set_source_status(&app, source.id, "failed");
      Ok(TestSourceResultDto {
        source_id: source.id,
        ok: false,
        status_code: None,
        latency_ms: started.elapsed().as_millis(),
        message: format!("Falha de conexao: {error}"),
      })
    }
  }
}

#[tauri::command]
async fn get_download_sources_changes(app: AppHandle) -> Result<Vec<GameSourceChangeDto>, String> {
  let conn = open_database_connection(&app)?;
  let games: Vec<(i64, String)> = {
    let mut stmt = conn
      .prepare("SELECT id, title FROM games ORDER BY id ASC")
      .map_err(|error| format!("could_not_prepare_games_query: {error}"))?;
    let rows = stmt
      .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
      .map_err(|error| format!("could_not_query_games: {error}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|error| format!("could_not_map_games: {error}"))?;
    rows
  };
  let sources = load_sources(&conn)?;
  drop(conn);

  let mut changes: Vec<GameSourceChangeDto> = Vec::new();
  for (game_id, game_title) in games {
    let options = fetch_options_from_sources(&app, game_id, &game_title, &sources).await;
    let count = options.len() as i64;

    let conn = open_database_connection(&app)?;
    conn
      .execute(
        "INSERT INTO download_source_changes (game_id, new_count, updated_at) \
         VALUES (?1, ?2, CURRENT_TIMESTAMP) \
         ON CONFLICT(game_id) DO UPDATE SET new_count = excluded.new_count, updated_at = CURRENT_TIMESTAMP",
        params![game_id, count],
      )
      .map_err(|error| format!("could_not_upsert_source_change: {error}"))?;

    changes.push(GameSourceChangeDto {
      game_id,
      new_download_options_count: count,
    });
  }

  Ok(changes)
}

#[tauri::command]
async fn search_game_download_options(
  app: AppHandle,
  payload: SearchGameOptionsPayload,
) -> Result<Vec<DownloadOptionDto>, String> {
  let conn = open_database_connection(&app)?;
  let game_title: String = conn
    .query_row(
      "SELECT title FROM games WHERE id = ?1",
      params![payload.game_id],
      |row| row.get(0),
    )
    .map_err(|error| format!("could_not_find_game: {error}"))?;
  let sources = load_sources(&conn)?;
  drop(conn);

  Ok(fetch_options_from_sources(&app, payload.game_id, &game_title, &sources).await)
}

#[tauri::command]
async fn search_download_options(
  app: AppHandle,
  payload: SearchDownloadOptionsPayload,
) -> Result<Vec<DownloadOptionDto>, String> {
  let query = payload.query.trim();
  if query.len() < 2 {
    return Ok(Vec::new());
  }

  let conn = open_database_connection(&app)?;
  let hydra_sources = list_hydra_sources(&conn)?;
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn)?;
  drop(conn);

  let active_sources: Vec<HydraSourceDto> = hydra_sources
    .into_iter()
    .filter(|source| !disabled.contains(&source.id))
    .collect();

  if active_sources.is_empty() {
    return Ok(Vec::new());
  }

  Ok(search_download_options_from_local_sources(query, &active_sources).await)
}

#[tauri::command]
fn set_default_download_path(
  app: AppHandle,
  payload: SetDefaultDownloadPathPayload,
) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  let path = payload.path.trim();
  if path.is_empty() {
    return Err("default_download_path_empty".to_string());
  }
  conn
    .execute(
      "INSERT INTO app_settings (key, value) VALUES ('default_download_path', ?1) \
       ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      params![path],
    )
    .map_err(|error| format!("could_not_set_default_download_path: {error}"))?;
  Ok(())
}

#[tauri::command]
fn get_default_download_path(app: AppHandle) -> Result<Option<String>, String> {
  let conn = open_database_connection(&app)?;
  let value = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = 'default_download_path'",
      [],
      |row| row.get::<_, String>(0),
    )
    .ok();
  Ok(value)
}

#[tauri::command]
fn set_seed_torrents_enabled(
  app: AppHandle,
  payload: SetSeedTorrentsEnabledPayload,
) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  let value = if payload.enabled { "1" } else { "0" };
  conn
    .execute(
      "INSERT INTO app_settings (key, value) VALUES ('seed_torrents_enabled', ?1) \
       ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      params![value],
    )
    .map_err(|error| format!("could_not_set_seed_torrents_enabled: {error}"))?;
  Ok(())
}

#[tauri::command]
fn get_seed_torrents_enabled(app: AppHandle) -> Result<bool, String> {
  let conn = open_database_connection(&app)?;
  let value = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = 'seed_torrents_enabled'",
      [],
      |row| row.get::<_, String>(0),
    )
    .ok();

  Ok(!matches!(value.as_deref(), Some("0") | Some("false") | Some("FALSE")))
}

fn validate_app_setting_key(key: &str) -> Result<(), String> {
  if key.is_empty() || key.len() > 80 {
    return Err("invalid_app_setting_key".to_string());
  }
  if !key
    .chars()
    .all(|c| c.is_ascii_alphanumeric() || c == '_')
  {
    return Err("invalid_app_setting_key".to_string());
  }
  Ok(())
}

fn get_disabled_hydra_source_ids_from_conn(
  conn: &Connection,
) -> Result<HashSet<String>, String> {
  let value: Option<String> = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = 'disabled_hydra_source_ids'",
      [],
      |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("could_not_read_disabled_hydra_sources: {e}"))?;
  let Some(json) = value else {
    return Ok(HashSet::new());
  };
  let list: Vec<String> = serde_json::from_str(&json)
    .map_err(|e| format!("could_not_parse_disabled_hydra_sources: {e}"))?;
  Ok(list.into_iter().collect())
}

#[tauri::command]
fn get_app_setting(app: AppHandle, payload: GetAppSettingPayload) -> Result<Option<String>, String> {
  validate_app_setting_key(&payload.key)?;
  let conn = open_database_connection(&app)?;
  let value: Option<String> = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = ?1",
      params![&payload.key],
      |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("could_not_get_app_setting: {e}"))?;
  Ok(value)
}

#[tauri::command]
fn set_app_setting(app: AppHandle, payload: SetAppSettingPayload) -> Result<(), String> {
  validate_app_setting_key(&payload.key)?;
  if payload.value.len() > 65_000 {
    return Err("app_setting_value_too_large".to_string());
  }
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "INSERT INTO app_settings (key, value) VALUES (?1, ?2) \
       ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      params![&payload.key, &payload.value],
    )
    .map_err(|e| format!("could_not_set_app_setting: {e}"))?;
  Ok(())
}

/// Espaço livre no volume que contém o caminho (bytes). Útil para mostrar no UI de pastas.
#[tauri::command]
fn get_disk_free_bytes_for_path(
  payload: DiskPathPayload,
) -> Result<Option<u64>, String> {
  use sysinfo::Disks;

  let path_arg = payload.path.trim();
  if path_arg.is_empty() {
    return Ok(None);
  }
  let path = Path::new(path_arg);
  if path == Path::new("") {
    return Ok(None);
  }
  let candidate = if path.exists() {
    path
      .canonicalize()
      .map_err(|e| format!("disk_path_error: {e}"))?
  } else {
    // Pasta ainda não criada: usa o root do caminho inserido
    // (ex. "D:\Games" → tenta achar o disco "D:\").
    let mut p = path.to_path_buf();
    if !p.has_root() {
      return Ok(None);
    }
    while p.parent().is_some() && !p.as_path().exists() {
      if let Some(parent) = p.parent() {
        p = parent.to_path_buf();
      } else {
        break;
      }
    }
    p
  };

  let s = candidate.to_string_lossy().to_string();
  #[cfg(windows)]
  let s_norm: String = s.to_lowercase();
  #[cfg(not(windows))]
  let s_norm = s;

  let disks = Disks::new_with_refreshed_list();
  let mut best: Option<(usize, u64)> = None;
  for disk in disks.list() {
    let m = disk.mount_point().to_string_lossy();
    #[cfg(windows)]
    let m_norm: String = m.to_lowercase();
    #[cfg(not(windows))]
    let m_norm: String = m.to_string();
    if s_norm.starts_with(m_norm.as_str()) {
      let len = m_norm.len();
      if best.map_or(true, |(best_len, _)| len > best_len) {
        best = Some((len, disk.available_space()));
      }
    }
  }
  Ok(best.map(|(_, space)| space))
}

#[tauri::command]
fn scan_default_download_path(app: AppHandle) -> Result<Vec<LocalLibraryItemDto>, String> {
  let default_path = get_default_download_path(app.clone())?;
  let path = match default_path {
    Some(path) if !path.trim().is_empty() => path,
    _ => return Ok(Vec::new()),
  };

  let entries = fs::read_dir(&path).map_err(|error| format!("could_not_read_default_path: {error}"))?;
  let mut items: Vec<LocalLibraryItemDto> = Vec::new();

  for entry in entries {
    let entry = match entry {
      Ok(value) => value,
      Err(_) => continue,
    };
    let metadata = match entry.metadata() {
      Ok(value) => value,
      Err(_) => continue,
    };

    let modified_at = metadata
      .modified()
      .ok()
      .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
      .map(|duration| duration.as_secs())
      .unwrap_or(0);

    items.push(LocalLibraryItemDto {
      name: entry.file_name().to_string_lossy().to_string(),
      path: entry.path().to_string_lossy().to_string(),
      is_dir: metadata.is_dir(),
      size_bytes: if metadata.is_file() { metadata.len() } else { 0 },
      modified_at,
    });
  }

  items.sort_by_key(|b| std::cmp::Reverse(b.modified_at));
  Ok(items)
}

#[tauri::command]
fn delete_local_library_item(
  app: AppHandle,
  payload: DeleteLocalLibraryItemPayload,
) -> Result<(), String> {
  let default_path = get_default_download_path(app.clone())?
    .ok_or_else(|| "default_download_path_not_configured".to_string())?;

  let base_dir = std::path::PathBuf::from(default_path);
  let target = std::path::PathBuf::from(payload.path);

  if !target.exists() {
    return Err("local_item_not_found".to_string());
  }

  let canonical_base = std::fs::canonicalize(&base_dir)
    .map_err(|error| format!("could_not_resolve_base_path: {error}"))?;
  let canonical_target = std::fs::canonicalize(&target)
    .map_err(|error| format!("could_not_resolve_target_path: {error}"))?;

  if !canonical_target.starts_with(&canonical_base) {
    return Err("path_outside_default_download_path".to_string());
  }

  if canonical_target.is_dir() {
    std::fs::remove_dir_all(&canonical_target)
      .map_err(|error| format!("could_not_delete_directory: {error}"))?;
  } else {
    std::fs::remove_file(&canonical_target)
      .map_err(|error| format!("could_not_delete_file: {error}"))?;
  }

  Ok(())
}

#[tauri::command]
async fn add_download_source(
  app: AppHandle,
  payload: AddDownloadSourcePayload,
) -> Result<HydraSourceDto, String> {
  validate_source_url(&payload.url)?;
  let source = create_local_hydra_source(&payload.url);
  let conn = open_database_connection(&app)?;
  upsert_hydra_source(&conn, &source)?;
  Ok(source)
}

#[tauri::command]
fn get_download_sources(app: AppHandle) -> Result<Vec<HydraSourceDto>, String> {
  let conn = open_database_connection(&app)?;
  list_hydra_sources(&conn)
}

#[tauri::command]
async fn sync_download_sources(app: AppHandle) -> Result<Vec<HydraSourceDto>, String> {
  let conn = open_database_connection(&app)?;
  list_hydra_sources(&conn)
}

#[tauri::command]
async fn check_download_sources_changes(app: AppHandle) -> Result<Vec<GameSourceChangeDto>, String> {
  let conn = open_database_connection(&app)?;
  let sources = list_hydra_sources(&conn)?;
  let source_ids: Vec<String> = sources.into_iter().map(|source| source.id).collect();
  if source_ids.is_empty() {
    return Ok(Vec::new());
  }

  let games: Vec<(i64, String)> = {
    let mut stmt = conn
      .prepare("SELECT id, title FROM games ORDER BY id ASC")
      .map_err(|error| format!("could_not_prepare_games_query: {error}"))?;
    let result = stmt
      .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
      .map_err(|error| format!("could_not_query_games: {error}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|error| format!("could_not_map_games: {error}"))?;
    result
  };

  if games.is_empty() {
    return Ok(Vec::new());
  }

  let raw_changes = hydra_check_download_sources_changes(&source_ids, &games).await?;
  let mut changes: Vec<GameSourceChangeDto> = Vec::new();

  for (game_id, count) in raw_changes {
    conn
      .execute(
        "INSERT INTO download_source_changes (game_id, new_count, updated_at) \
         VALUES (?1, ?2, CURRENT_TIMESTAMP) \
         ON CONFLICT(game_id) DO UPDATE SET new_count = excluded.new_count, updated_at = CURRENT_TIMESTAMP",
        params![game_id, count],
      )
      .map_err(|error| format!("could_not_upsert_source_change: {error}"))?;
    changes.push(GameSourceChangeDto {
      game_id,
      new_download_options_count: count,
    });
  }

  Ok(changes)
}

#[tauri::command]
fn remove_download_source(app: AppHandle, payload: RemoveHydraSourcePayload) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "DELETE FROM hydra_download_sources WHERE id = ?1",
      params![payload.id],
    )
    .map_err(|error| format!("could_not_remove_hydra_source: {error}"))?;
  Ok(())
}

// ── Commands: Games ───────────────────────────────────────────────────────────

#[tauri::command]
fn add_game(app: AppHandle, payload: AddGamePayload) -> Result<GameDto, String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "INSERT INTO games (title, install_path, is_favorite) VALUES (?1, ?2, 0)",
      params![payload.title, payload.install_path],
    )
    .map_err(|e| format!("could_not_insert_game: {e}"))?;
  fetch_game_by_id(&conn, conn.last_insert_rowid())
}

#[tauri::command]
fn list_games(app: AppHandle) -> Result<Vec<GameDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare(
      "SELECT g.id, g.title, g.install_path, g.is_favorite, \
       COALESCE(dsc.new_count, 0), g.created_at \
       FROM games g \
       LEFT JOIN download_source_changes dsc ON dsc.game_id = g.id \
       ORDER BY g.id DESC",
    )
    .map_err(|e| format!("could_not_prepare_list_games: {e}"))?;
  let result = stmt
    .query_map([], |row| {
      Ok(GameDto {
        id: row.get(0)?,
        title: row.get(1)?,
        install_path: row.get(2)?,
        is_favorite: row.get::<_, i64>(3)? == 1,
        new_download_options_count: row.get(4)?,
        created_at: row.get(5)?,
      })
    })
    .map_err(|e| format!("could_not_query_games: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_games: {e}"));
  result
}

#[tauri::command]
fn update_game(app: AppHandle, payload: UpdateGamePayload) -> Result<GameDto, String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "UPDATE games SET title = ?1, install_path = ?2 WHERE id = ?3",
      params![payload.title, payload.install_path, payload.id],
    )
    .map_err(|e| format!("could_not_update_game: {e}"))?;
  fetch_game_by_id(&conn, payload.id)
}

#[tauri::command]
fn remove_game(app: AppHandle, payload: RemoveGamePayload) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute("DELETE FROM games WHERE id = ?1", params![payload.id])
    .map_err(|e| format!("could_not_remove_game: {e}"))?;
  Ok(())
}

#[tauri::command]
fn toggle_game_favorite(app: AppHandle, payload: ToggleFavoritePayload) -> Result<GameDto, String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "UPDATE games SET is_favorite = ?1 WHERE id = ?2",
      params![payload.favorite as i64, payload.id],
    )
    .map_err(|e| format!("could_not_toggle_favorite: {e}"))?;
  fetch_game_by_id(&conn, payload.id)
}

// ── Commands: Mock Download (legacy) ─────────────────────────────────────────

#[tauri::command]
fn start_mock_download(app: AppHandle, payload: StartMockDownloadPayload) -> Result<(), String> {
  let app_handle = app.clone();
  tauri::async_runtime::spawn(async move {
    for progress in 0u8..=100 {
      let status = if progress >= 100 { "completed" } else { "downloading" };
      let _ = app_handle.emit(
        DOWNLOAD_EVENT_PROGRESS,
        DownloadProgressPayload {
          download_id: payload.download_id.clone(),
          progress,
          speed_bytes_per_sec: 850_000,
          eta_seconds: ((100 - progress) as u64).saturating_mul(2),
          status: status.to_string(),
        },
      );
      sleep(Duration::from_millis(250)).await;
    }
  });
  Ok(())
}

// ── Commands: Queue ───────────────────────────────────────────────────────────

#[tauri::command]
fn enqueue_job(app: AppHandle, payload: EnqueueJobPayload) -> Result<DownloadJobDto, String> {
  validate_job_url(&payload.url)?;
  let conn = open_database_connection(&app)?;
  let priority = payload.priority.unwrap_or(0);
  conn
    .execute(
      "INSERT INTO download_jobs (title, url, dest_path, priority) VALUES (?1, ?2, ?3, ?4)",
      params![payload.title, payload.url, payload.dest_path, priority],
    )
    .map_err(|e| format!("could_not_enqueue_job: {e}"))?;
  let job_id = conn.last_insert_rowid();
  let job = fetch_job_by_id(&conn, job_id)?;
  drop(conn);

  let app_clone = app.clone();
  let queue: tauri::State<'_, QueueManager> = app_clone.state();
  maybe_start_next_job(
    app,
    queue.active_job_id.clone(),
    queue.should_cancel.clone(),
    queue.should_pause.clone(),
  );
  Ok(job)
}

#[tauri::command]
fn list_jobs(app: AppHandle) -> Result<Vec<DownloadJobDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare(
      "SELECT id, title, url, dest_path, status, priority, progress, \
       bytes_downloaded, total_bytes, error_msg, created_at, updated_at \
       FROM download_jobs ORDER BY priority DESC, id ASC",
    )
    .map_err(|e| format!("could_not_prepare_list_jobs: {e}"))?;
  let result = stmt
    .query_map([], map_job_row)
    .map_err(|e| format!("could_not_query_jobs: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_jobs: {e}"));
  result
}

#[tauri::command]
fn cancel_job(app: AppHandle, payload: JobIdPayload) -> Result<(), String> {
  let queue: tauri::State<'_, QueueManager> = app.state();
  let is_active = *queue.active_job_id.lock().unwrap() == Some(payload.id);
  if is_active {
    *queue.should_cancel.lock().unwrap() = true;
  } else {
    let conn = open_database_connection(&app)?;
    conn
      .execute(
        "UPDATE download_jobs SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?1 AND status IN ('pending', 'paused')",
        params![payload.id],
      )
      .map_err(|e| format!("could_not_cancel_job: {e}"))?;
  }
  Ok(())
}

#[tauri::command]
fn pause_job(app: AppHandle, payload: JobIdPayload) -> Result<(), String> {
  let queue: tauri::State<'_, QueueManager> = app.state();
  let is_active = *queue.active_job_id.lock().unwrap() == Some(payload.id);
  if is_active {
    *queue.should_pause.lock().unwrap() = true;
  } else {
    let conn = open_database_connection(&app)?;
    conn
      .execute(
        "UPDATE download_jobs SET status = 'paused', updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?1 AND status = 'pending'",
        params![payload.id],
      )
      .map_err(|e| format!("could_not_pause_job: {e}"))?;
  }
  Ok(())
}

#[tauri::command]
fn resume_job(app: AppHandle, payload: JobIdPayload) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "UPDATE download_jobs SET status = 'pending', updated_at = CURRENT_TIMESTAMP \
       WHERE id = ?1 AND status = 'paused'",
      params![payload.id],
    )
    .map_err(|e| format!("could_not_resume_job: {e}"))?;
  drop(conn);

  let app_clone = app.clone();
  let queue: tauri::State<'_, QueueManager> = app_clone.state();
  maybe_start_next_job(
    app,
    queue.active_job_id.clone(),
    queue.should_cancel.clone(),
    queue.should_pause.clone(),
  );
  Ok(())
}

#[tauri::command]
async fn clear_completed_jobs(app: AppHandle) -> Result<Vec<String>, String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let value = client
    .get(format!("http://127.0.0.1:{port}/jobs"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))?;

  let rows = match value {
    serde_json::Value::Array(items) => items,
    serde_json::Value::Object(map) => map
      .get("jobs")
      .or_else(|| map.get("data"))
      .and_then(|v| v.as_array())
      .cloned()
      .unwrap_or_default(),
    _ => Vec::new(),
  };

  let conn = open_database_connection(&app)?;
  let mut removed: Vec<String> = Vec::new();

  for row in rows {
    let job = match serde_json::from_value::<SidecarJobWatcher>(row) {
      Ok(job) => job,
      Err(_) => continue,
    };
    let extracted = get_extraction_status(&conn, &job.id);
    let should_remove = matches!(job.status.as_str(), "completed" | "cancelled" | "failed")
      || matches!(extracted.as_deref(), Some("extracted"));
    if !should_remove {
      continue;
    }
    let _ = client
      .delete(format!("http://127.0.0.1:{port}/jobs/{}", job.id))
      .send()
      .await;
    let _ = conn.execute(
      "DELETE FROM extraction_log WHERE job_id = ?1",
      params![job.id],
    );
    removed.push(job.id);
  }

  conn
    .execute(
      "DELETE FROM download_jobs WHERE status IN ('completed', 'cancelled', 'failed')",
      [],
    )
    .map_err(|e| format!("could_not_clear_jobs: {e}"))?;

  Ok(removed)
}

// ── Queue Engine ──────────────────────────────────────────────────────────────

fn maybe_start_next_job(
  app: AppHandle,
  active_arc: Arc<Mutex<Option<i64>>>,
  cancel_arc: Arc<Mutex<bool>>,
  pause_arc: Arc<Mutex<bool>>,
) {
  // Bail out early if a job is already running
  {
    let active = active_arc.lock().unwrap();
    if active.is_some() {
      return;
    }
  }

  let conn = match open_database_connection(&app) {
    Ok(c) => c,
    Err(_) => return,
  };

  let next: Option<(i64, String)> = conn
    .query_row(
      "SELECT id, title FROM download_jobs \
       WHERE status = 'pending' ORDER BY priority DESC, id ASC LIMIT 1",
      [],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .ok();

  let (job_id, _title) = match next {
    Some(j) => j,
    None => return,
  };

  // Claim the slot (check again to prevent races)
  {
    let mut active = active_arc.lock().unwrap();
    if active.is_some() {
      return;
    }
    *active = Some(job_id);
  }

  *cancel_arc.lock().unwrap() = false;
  *pause_arc.lock().unwrap() = false;

  let _ = conn.execute(
    "UPDATE download_jobs SET status = 'downloading', updated_at = CURRENT_TIMESTAMP \
     WHERE id = ?1",
    params![job_id],
  );

  let app_c = app.clone();
  let active_c = active_arc.clone();
  let cancel_c = cancel_arc.clone();
  let pause_c = pause_arc.clone();

  tauri::async_runtime::spawn(async move {
    let mut final_status = "completed";
    let mut last_progress = 0i64;

    for progress in 0i64..=100 {
      last_progress = progress;

      if *cancel_c.lock().unwrap() {
        final_status = "cancelled";
        break;
      }
      if *pause_c.lock().unwrap() {
        final_status = "paused";
        break;
      }

      // Persist progress checkpoint every 5 steps
      if progress % 5 == 0 {
        if let Ok(conn) = open_database_connection(&app_c) {
          let _ = conn.execute(
            "UPDATE download_jobs SET progress = ?1, updated_at = CURRENT_TIMESTAMP \
             WHERE id = ?2",
            params![progress, job_id],
          );
        }
      }

      let _ = app_c.emit(
        QUEUE_EVENT_JOB_PROGRESS,
        JobProgressEvent {
          job_id: job_id.to_string(),
          progress: progress as f64,
          status: "downloading".to_string(),
          speed_bytes_per_sec: 1_200_000,
          eta_seconds: (100 - progress) * 2,
          bytes_downloaded: None,
          total_bytes: None,
        },
      );

      sleep(Duration::from_millis(300)).await;
    }

    // Persist final state
    let final_progress = if final_status == "completed" { 100 } else { last_progress };
    if let Ok(conn) = open_database_connection(&app_c) {
      let _ = conn.execute(
        "UPDATE download_jobs SET status = ?1, progress = ?2, \
         updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![final_status, final_progress, job_id],
      );
    }

    let _ = app_c.emit(
      QUEUE_EVENT_JOB_PROGRESS,
      JobProgressEvent {
        job_id: job_id.to_string(),
        progress: final_progress as f64,
        status: final_status.to_string(),
        speed_bytes_per_sec: 0,
        eta_seconds: 0,
        bytes_downloaded: None,
        total_bytes: None,
      },
    );

    if final_status == "completed" {
      let _ = app_c
        .notification()
        .builder()
        .title("Download concluido")
        .body(format!("Job #{job_id} finalizado com sucesso."))
        .show();
    }

    *active_c.lock().unwrap() = None;
    *cancel_c.lock().unwrap() = false;
    *pause_c.lock().unwrap() = false;

    // Automatically start the next pending job
    if final_status == "completed" {
      maybe_start_next_job(app_c, active_c, cancel_c, pause_c);
    }
  });
}

/// On startup, reset jobs that were interrupted mid-download back to pending
fn startup_queue_recovery(app: &AppHandle) {
  if let Ok(conn) = open_database_connection(app) {
    let _ = conn.execute(
      "UPDATE download_jobs SET status = 'pending', updated_at = CURRENT_TIMESTAMP \
       WHERE status = 'downloading'",
      [],
    );
  }
  let queue: tauri::State<'_, QueueManager> = app.state();
  maybe_start_next_job(
    app.clone(),
    queue.active_job_id.clone(),
    queue.should_cancel.clone(),
    queue.should_pause.clone(),
  );
}

// ── Commands: Sidecar Proxy ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SidecarEnqueuePayload {
  title: String,
  url: String,
  dest_path: Option<String>,
  priority: Option<i32>,
  cover_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SidecarJobForLaunch {
  id: String,
  title: String,
  #[serde(default, alias = "destPath")]
  dest_path: String,
}

#[tauri::command]
async fn sidecar_enqueue_job(
  app: AppHandle,
  payload: SidecarEnqueuePayload,
) -> Result<serde_json::Value, String> {
  validate_job_url(&payload.url)?;
  let port = ensure_sidecar_running(app.clone()).await?;
  let conn = open_database_connection(&app)?;
  let default_dest_path = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = 'default_download_path'",
      [],
      |row| row.get::<_, String>(0),
    )
    .ok();
  let seed_enabled = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = 'seed_torrents_enabled'",
      [],
      |row| row.get::<_, String>(0),
    )
    .ok()
    .map(|value| !matches!(value.as_str(), "0" | "false" | "FALSE"))
    .unwrap_or(true);
  let max_speed_bps = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = 'download_speed_limit_bps'",
      [],
      |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|s| s.parse::<u64>().ok())
    .filter(|&v| v > 0);
  let dest_path = payload
    .dest_path
    .clone()
    .or(default_dest_path)
    .ok_or_else(|| "default_download_path_not_configured".to_string())?;
  let job_url = enrich_magnet_url(&payload.url);
  drop(conn);

  let body = {
    let mut b = serde_json::json!({
      "title": payload.title,
      "url": job_url,
      "destPath": dest_path,
      "priority": payload.priority,
      "seedEnabled": seed_enabled
    });
    if let Some(bps) = max_speed_bps {
      b["maxDownloadSpeedBps"] = bps.into();
    }
    b
  };

  let client = reqwest::Client::new();
  let job = client
    .post(format!("http://127.0.0.1:{port}/jobs"))
    .json(&body)
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))?;

  if let Some(cover_url) = payload
    .cover_url
    .as_ref()
    .map(|value| value.trim())
    .filter(|value| !value.is_empty())
  {
    if let Ok(conn) = open_database_connection(&app) {
      if let Ok(Some(path)) = upsert_game_cover(&conn, &payload.title, cover_url) {
        remove_cover_file(&path);
      }
    }
    let app_bg = app.clone();
    let title_bg = payload.title.clone();
    let cover_bg = cover_url.to_string();
    tauri::async_runtime::spawn(async move {
      let _ = download_and_cache_cover(&app_bg, &title_bg, &cover_bg).await;
    });
  }

  Ok(job)
}

#[tauri::command]
async fn sidecar_list_jobs(app: AppHandle) -> Result<serde_json::Value, String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let mut value = client
    .get(format!("http://127.0.0.1:{port}/jobs"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))?;

  if let Ok(conn) = open_database_connection(&app) {
    enrich_jobs_with_extraction(&mut value, &conn);
  }

  Ok(value)
}

#[tauri::command]
async fn sidecar_pause_job(app: AppHandle, id: String) -> Result<(), String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  client
    .post(format!("http://127.0.0.1:{port}/jobs/{id}/pause"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?;
  Ok(())
}

#[tauri::command]
async fn sidecar_resume_job(app: AppHandle, id: String) -> Result<(), String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  client
    .post(format!("http://127.0.0.1:{port}/jobs/{id}/resume"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?;
  Ok(())
}

#[tauri::command]
async fn sidecar_cancel_job(app: AppHandle, id: String) -> Result<(), String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  client
    .delete(format!("http://127.0.0.1:{port}/jobs/{id}"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?;
  Ok(())
}

#[tauri::command]
async fn remove_job_from_library(app: AppHandle, id: String) -> Result<(), String> {
  if let Ok(port) = ensure_sidecar_running(app.clone()).await {
    let client = reqwest::Client::new();
    let _ = client
      .delete(format!("http://127.0.0.1:{port}/jobs/{id}"))
      .send()
      .await;
  }

  let conn = open_database_connection(&app)?;
  let _ = conn.execute(
    "DELETE FROM extraction_log WHERE job_id = ?1",
    params![id],
  );
  conn
    .execute("DELETE FROM download_jobs WHERE id = ?1", params![id])
    .map_err(|error| format!("could_not_remove_job: {error}"))?;
  Ok(())
}

#[tauri::command]
async fn sidecar_open_job_folder(app: AppHandle, id: String) -> Result<(), String> {
  let job = fetch_sidecar_job(&app, &id).await?;
  let target_path = resolve_job_folder(&job.dest_path);
  if !target_path.exists() {
    return Err("job_folder_not_found".to_string());
  }

  #[cfg(target_os = "windows")]
  {
    StdCommand::new("explorer")
      .arg(target_path.as_os_str())
      .spawn()
      .map_err(|error| format!("could_not_open_folder: {error}"))?;
  }

  #[cfg(target_os = "linux")]
  {
    StdCommand::new("xdg-open")
      .arg(target_path.as_os_str())
      .spawn()
      .map_err(|error| format!("could_not_open_folder: {error}"))?;
  }

  #[cfg(target_os = "macos")]
  {
    StdCommand::new("open")
      .arg(target_path.as_os_str())
      .spawn()
      .map_err(|error| format!("could_not_open_folder: {error}"))?;
  }

  Ok(())
}

fn open_path_in_shell(target: &Path) -> Result<(), String> {
  if !target.exists() {
    return Err("local_path_not_found".to_string());
  }

  #[cfg(target_os = "windows")]
  {
    StdCommand::new("explorer")
      .arg(target.as_os_str())
      .spawn()
      .map_err(|error| format!("could_not_open_folder: {error}"))?;
  }

  #[cfg(target_os = "linux")]
  {
    StdCommand::new("xdg-open")
      .arg(target.as_os_str())
      .spawn()
      .map_err(|error| format!("could_not_open_folder: {error}"))?;
  }

  #[cfg(target_os = "macos")]
  {
    StdCommand::new("open")
      .arg(target.as_os_str())
      .spawn()
      .map_err(|error| format!("could_not_open_folder: {error}"))?;
  }

  Ok(())
}

#[tauri::command]
fn open_local_path(path: String) -> Result<(), String> {
  open_path_in_shell(&PathBuf::from(path.trim()))
}

#[tauri::command]
async fn sidecar_launch_job(app: AppHandle, id: String) -> Result<String, String> {
  let job = fetch_sidecar_job(&app, &id).await?;
  let extra_roots = launch_extra_roots(&app, &job.title, &job.dest_path, Some(&id));
  let launched = launch::resolve_and_launch_game_with_extra_roots(
    &job.title,
    &job.dest_path,
    &extra_roots,
  )
  .map_err(|error| map_launch_user_error(&error, &job.dest_path))?;
  Ok(launched.to_string_lossy().to_string())
}

async fn fetch_sidecar_job(app: &AppHandle, id: &str) -> Result<SidecarJobForLaunch, String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  client
    .get(format!("http://127.0.0.1:{port}/jobs/{id}"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .error_for_status()
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<SidecarJobForLaunch>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))
}

fn resolve_job_folder(dest_path: &str) -> PathBuf {
  let path = PathBuf::from(dest_path);
  if path.is_dir() {
    path
  } else {
    path.parent().map(Path::to_path_buf).unwrap_or(path)
  }
}

fn map_launch_user_error(error: &str, dest_path: &str) -> String {
  if error.contains("launch_target_root_not_found") {
    return "Pasta do jogo não encontrada. Confirme o caminho de download em Configurações.".to_string();
  }
  if error.contains("game_not_installed_use_installer") {
    return "O jogo ainda não está instalado. Clique em INSTALAR para executar o instalador na pasta do download.".to_string();
  }
  if error.contains("no_executable_found_in_job_folder") {
    if archive::find_job_archive(dest_path).is_some() {
      return "Este repack precisa de setup.exe (ex.: FitGirl). Instale manualmente ou escolha outro torrent.".to_string();
    }
    if launch::find_setup_executable("", dest_path).is_some() {
      return "O jogo ainda não está instalado. Clique em INSTALAR para executar o instalador.".to_string();
    }
    return "Nenhum executável de jogo encontrado na pasta. Instale o jogo com o setup.exe primeiro.".to_string();
  }
  if error.contains("193")
    || error.contains("não é um aplicativo Win32 válido")
    || error.contains("not a valid Win32 application")
  {
    return "Não foi possível iniciar o jogo automaticamente. Abra a pasta, execute o setup se existir, ou inicie o .exe principal manualmente.".to_string();
  }
  if error.contains("1392")
    || error.contains("corrompido")
    || error.contains("corrupt")
    || error.contains("ilegível")
    || error.contains("illegible")
  {
    return "O Windows bloqueou o ficheiro (erro 1392). Abra a pasta do jogo, clique duas vezes em setup.exe manualmente, ou mova o jogo para outro disco (ex. C:). Se persistir, execute: chkdsk J: /F".to_string();
  }
  if error.contains("nenhum executável válido encontrado") {
    return "Nenhum executável válido encontrado na pasta do jogo.".to_string();
  }
  error.to_string()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaunchGamePayload {
  title: String,
  path: String,
  job_id: Option<String>,
}

#[tauri::command]
fn launch_game_from_path(app: AppHandle, payload: LaunchGamePayload) -> Result<String, String> {
  let extra_roots = launch_extra_roots(
    &app,
    &payload.title,
    &payload.path,
    payload.job_id.as_deref(),
  );
  let launched = launch::resolve_and_launch_game_with_extra_roots(
    &payload.title,
    &payload.path,
    &extra_roots,
  )
  .map_err(|error| map_launch_user_error(&error, &payload.path))?;
  Ok(launched.to_string_lossy().to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetLibraryGameRootPayload {
  title: String,
  dest_path: String,
  game_root: String,
  job_id: Option<String>,
}

#[tauri::command]
fn set_library_game_root(app: AppHandle, payload: SetLibraryGameRootPayload) -> Result<LibraryPathStateDto, String> {
  let game_root = PathBuf::from(payload.game_root.trim());
  if !game_root.is_dir() {
    return Err("A pasta escolhida não existe.".to_string());
  }
  if !launch::folder_has_playable_game_exe(&payload.title, &game_root) {
    return Err(
      "Não encontrámos um executável jogável nessa pasta. Escolha a pasta onde o jogo foi instalado (com o .exe do jogo)."
        .to_string(),
    );
  }

  let conn = open_database_connection(&app)?;
  upsert_library_game_root(&conn, &payload.dest_path, &payload.title, &game_root)?;
  Ok(inspect_library_path_internal(
    &app,
    &payload.title,
    &payload.dest_path,
    payload.job_id.as_deref(),
  ))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryPathStateDto {
  has_game: bool,
  needs_install: bool,
  install_path: Option<String>,
  needs_extraction: bool,
  /// Alias de `has_game` para compatibilidade com clientes antigos.
  playable: bool,
  /// Pasta de instalação indicada manualmente pelo utilizador (fora da pasta de download).
  custom_game_root: Option<String>,
}

fn folder_extraction_job_id(path: &str) -> String {
  let mut hasher = DefaultHasher::new();
  path.to_lowercase().hash(&mut hasher);
  format!("folder:{:x}", hasher.finish())
}

fn inspect_library_path_internal(
  app: &AppHandle,
  title: &str,
  path: &str,
  job_id: Option<&str>,
) -> LibraryPathStateDto {
  let extra_roots = launch_extra_roots(app, title, path, job_id);
  let custom_game_root = open_database_connection(app)
    .ok()
    .and_then(|conn| read_library_game_root(&conn, path, title))
    .map(|path| path.to_string_lossy().to_string());
  let content_path = launch::resolve_game_content_root(title, path)
    .to_string_lossy()
    .to_string();
  let has_game =
    launch::resolve_launch_candidates_with_extra_roots(title, path, &extra_roots).is_ok();
  let install_path = launch::find_setup_executable_with_extra_roots(title, path, &extra_roots)
    .map(|p| p.to_string_lossy().to_string());
  let needs_install = !has_game && install_path.is_some();
  let has_archive = archive::find_job_archive(&content_path).is_some();
  // FitGirl e similares: setup.exe + .rar na mesma pasta — não forçar extração.
  let needs_extraction = has_archive && !has_game && install_path.is_none();

  LibraryPathStateDto {
    has_game,
    needs_install,
    install_path,
    needs_extraction,
    playable: has_game,
    custom_game_root,
  }
}

#[tauri::command]
fn inspect_library_path(app: AppHandle, payload: LaunchGamePayload) -> LibraryPathStateDto {
  inspect_library_path_internal(&app, &payload.title, &payload.path, payload.job_id.as_deref())
}

#[tauri::command]
async fn launch_setup_from_path(app: AppHandle, payload: LaunchGamePayload) -> Result<String, String> {
  let extra_roots = payload
    .job_id
    .as_deref()
    .map(|job_id| extraction_roots_for_job(&app, job_id))
    .unwrap_or_default();

  if let Some(job_id) = payload.job_id.clone() {
    let app_pause = app.clone();
    tauri::async_runtime::spawn(async move {
      let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(4))
        .build()
      {
        Ok(value) => value,
        Err(_) => return,
      };
      let Ok(port) = ensure_sidecar_running(app_pause.clone()).await else {
        return;
      };
      let _ = client
        .post(format!("http://127.0.0.1:{port}/jobs/{job_id}/pause"))
        .send()
        .await;
    });
  }

  let setup = launch::find_setup_executable_with_extra_roots(
    &payload.title,
    &payload.path,
    &extra_roots,
  )
  .ok_or_else(|| {
    "Nenhum instalador (setup.exe) encontrado na pasta do download.".to_string()
  })?;
  let install_dir = launch::resolve_game_content_root(&payload.title, &payload.path);
  if !setup.is_file() {
    return Err("setup.exe ainda não está disponível na pasta. Aguarde o download terminar.".to_string());
  }
  if !install_dir.exists() {
    return Err("Pasta do repack não encontrada. Aguarde o download terminar.".to_string());
  }

  launch::spawn_setup_executable_in(&setup, Some(&install_dir))
    .map_err(|error| map_launch_user_error(&error, &payload.path))?;
  Ok(setup.to_string_lossy().to_string())
}

#[tauri::command]
async fn extract_library_folder(app: AppHandle, payload: LaunchGamePayload) -> Result<(), String> {
  let extraction = app.state::<ExtractionState>();
  if !extraction.try_acquire() {
    return Err("extraction_busy".to_string());
  }

  let job_id = folder_extraction_job_id(&payload.path);
  let app_clone = app.clone();
  let title = payload.title.clone();
  let dest_path = payload.path.clone();

  let result = process_job_post_download(app_clone.clone(), job_id.clone(), title, dest_path).await;
  extraction.release();

  if let Err(ref error) = result {
    let _ = upsert_extraction_log(
      &open_database_connection(&app_clone)?,
      &job_id,
      "failed",
      None,
      None,
      Some(error),
    );
    emit_extract_status(&app_clone, &job_id, "failed", Some(error.clone()));
  }
  result
}

async fn pause_all_active_sidecar_jobs(app: AppHandle) -> Result<(), String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let jobs = client
    .get(format!("http://127.0.0.1:{port}/jobs"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))?;

  let Some(job_list) = jobs.as_array() else {
    return Ok(());
  };

  for job in job_list {
    let Some(status) = job.get("status").and_then(|value| value.as_str()) else {
      continue;
    };

    if status != "downloading" && status != "pending" && status != "seeding" {
      continue;
    }

    let Some(id) = job.get("id").and_then(|value| value.as_str()) else {
      continue;
    };

    let _ = client
      .post(format!("http://127.0.0.1:{port}/jobs/{id}/pause"))
      .send()
      .await;
  }

  Ok(())
}

#[tauri::command]
fn sidecar_status(app: AppHandle) -> serde_json::Value {
  let sidecar: tauri::State<'_, SidecarState> = app.state();
  match sidecar.get_port() {
    Some(port) => serde_json::json!({ "running": true, "port": port, "booting": sidecar.is_booting() }),
    None => serde_json::json!({ "running": false, "booting": sidecar.is_booting() }),
  }
}

#[tauri::command]
fn open_deep_link(app: AppHandle, url: String) -> Result<(), String> {
  emit_deep_link_event(&app, &url)?;
  Ok(())
}

fn emit_deep_link_event(app: &AppHandle, url: &str) -> Result<(), String> {
  let parsed = Url::parse(url).map_err(|error| format!("invalid_deep_link: {error}"))?;
  let action = Some(parsed.path().trim_start_matches('/').to_string()).filter(|value| !value.is_empty());
  let game_id = parsed
    .query_pairs()
    .find_map(|(key, value)| if key == "gameId" { Some(value.to_string()) } else { None });

  app
    .emit(
      APP_EVENT_DEEP_LINK,
      DeepLinkEventPayload {
        url: url.to_string(),
        game_id,
        action,
      },
    )
    .map_err(|error| format!("could_not_emit_deep_link_event: {error}"))
}

fn get_sidecar_port(app: &AppHandle) -> Result<u16, String> {
  let sidecar: tauri::State<'_, SidecarState> = app.state();
  sidecar
    .get_port()
    .ok_or_else(|| "sidecar_not_running".to_string())
}

/// Spawns the download-engine binary and captures its port announcement from stdout.
/// The binary must be built and placed at the expected path.
fn spawn_download_engine(app: AppHandle) {
  tauri::async_runtime::spawn(async move {
    let sidecar: tauri::State<'_, SidecarState> = app.state();
    sidecar.set_booting(true);
    sidecar.clear_port();

    let exe_name = if cfg!(target_os = "windows") {
      "download-engine.exe"
    } else {
      "download-engine"
    };
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut engine_candidates: Vec<std::path::PathBuf> = vec![
      manifest_dir.join("binaries").join(exe_name),
      manifest_dir.join(exe_name),
    ];
    if let Ok(resource_dir) = app.path().resource_dir() {
      engine_candidates.push(resource_dir.join("binaries").join(exe_name));
      engine_candidates.push(resource_dir.join(exe_name));
    }
    if let Ok(cwd) = std::env::current_dir() {
      engine_candidates.push(cwd.join(exe_name));
      engine_candidates.push(cwd.join("src-tauri").join(exe_name));
      engine_candidates.push(cwd.join("src-tauri").join("binaries").join(exe_name));
      engine_candidates.push(
        cwd.join("..")
          .join("download-engine")
          .join("target")
          .join("release")
          .join(exe_name),
      );
      engine_candidates.push(
        cwd.join("..")
          .join("download-engine")
          .join("target")
          .join("debug")
          .join(exe_name),
      );
    }
    if let Ok(app_data_dir) = app.path().app_data_dir() {
      engine_candidates.push(app_data_dir.parent().unwrap_or(&app_data_dir).join(exe_name));
    }
    let engine_path = engine_candidates
      .into_iter()
      .find(|path| path.exists())
      .unwrap_or_else(|| std::path::PathBuf::from(exe_name));

    let data_dir = app
      .path()
      .app_data_dir()
      .map(|p| p.to_string_lossy().to_string())
      .unwrap_or_else(|_| ".".to_string());

    let aria2_path = {
      let mut candidates: Vec<std::path::PathBuf> = Vec::new();
      let bundled_aria2 = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join("aria2c.exe");
      candidates.push(bundled_aria2.clone());
      if let Some(parent) = engine_path.parent() {
        let sidecar_local_aria2 = parent.join("aria2c.exe");
        if !sidecar_local_aria2.exists() && bundled_aria2.exists() {
          let _ = std::fs::copy(&bundled_aria2, &sidecar_local_aria2);
        }
        candidates.push(sidecar_local_aria2);
        candidates.push(parent.join("aria2c.exe"));
        candidates.push(parent.join("tools").join("aria2c.exe"));
      }
      if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("binaries").join("aria2c.exe"));
        candidates.push(cwd.join("src-tauri").join("binaries").join("aria2c.exe"));
        candidates.push(cwd.join("..").join("src-tauri").join("binaries").join("aria2c.exe"));
      }
      if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("aria2c.exe"));
        candidates.push(resource_dir.join("tools").join("aria2c.exe"));
        candidates.push(resource_dir.join("binaries").join("aria2c.exe"));
      }
      candidates.into_iter().find(|path| path.exists())
    };

    let mut cmd = tokio::process::Command::new(&engine_path);
    cmd
      .env("ENGINE_DATA_DIR", &data_dir)
      .stdout(std::process::Stdio::piped())
      .stderr(std::process::Stdio::null());
    if let Some(path) = aria2_path {
      cmd.env("ARIA2C_PATH", path);
    }

    let mut child = match cmd.spawn() {
      Ok(c) => c,
      Err(e) => {
        log::warn!("download-engine not found/could not start at {engine_path:?}: {e}");
        let sidecar: tauri::State<'_, SidecarState> = app.state();
        sidecar.set_booting(false);
        return;
      }
    };

    if let Some(stdout) = child.stdout.take() {
      use tokio::io::{AsyncBufReadExt, BufReader};
      let mut lines = BufReader::new(stdout).lines();
      while let Ok(Some(line)) = lines.next_line().await {
        if let Some(port_str) = line.strip_prefix("DOWNLOAD_ENGINE_PORT=") {
          if let Ok(port) = port_str.trim().parse::<u16>() {
            let sidecar: tauri::State<'_, SidecarState> = app.state();
            sidecar.set_port(port);
            sidecar.set_booting(false);
            log::info!("download-engine ready on port {port}");
            break;
          }
        }
      }
    }

    let _ = child.wait().await;
    let sidecar: tauri::State<'_, SidecarState> = app.state();
    sidecar.clear_port();
    sidecar.set_booting(false);
    log::warn!("download-engine exited");
  });
}

async fn ensure_sidecar_running(app: AppHandle) -> Result<u16, String> {
  if let Ok(port) = get_sidecar_port(&app) {
    return Ok(port);
  }

  let should_spawn = {
    let sidecar: tauri::State<'_, SidecarState> = app.state();
    !sidecar.is_booting()
  };
  if should_spawn {
    spawn_download_engine(app.clone());
  }

  for _ in 0..20 {
    if let Ok(port) = get_sidecar_port(&app) {
      return Ok(port);
    }
    sleep(Duration::from_millis(200)).await;
  }

  Err("sidecar_not_running".to_string())
}

// ── DB Helpers ────────────────────────────────────────────────────────────────

fn validate_source_url(value: &str) -> Result<(), String> {
  let parsed = Url::parse(value).map_err(|_| "invalid_source_url".to_string())?;
  let scheme = parsed.scheme();
  if scheme != "http" && scheme != "https" {
    return Err("source_url_must_be_http_or_https".to_string());
  }
  Ok(())
}

fn validate_job_url(value: &str) -> Result<(), String> {
  let parsed = Url::parse(value).map_err(|_| "invalid_job_url".to_string())?;
  if !matches!(parsed.scheme(), "http" | "https" | "magnet") {
    return Err("job_url_must_be_http_https_or_magnet".to_string());
  }
  if parsed.scheme() == "magnet" {
    let has_btih = parsed
      .query_pairs()
      .any(|(key, val)| key == "xt" && val.to_ascii_lowercase().starts_with("urn:btih:"));
    if !has_btih {
      return Err("invalid_magnet_missing_btih".to_string());
    }
  }
  Ok(())
}

const FALLBACK_MAGNET_TRACKERS: &[&str] = &[
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://tracker.tiny-vps.com:6969/announce",
  "udp://retracker.lanta.me:2710/announce",
  "udp://tracker.openbittorrent.com:6969/announce",
  "udp://opentracker.i2p.rocks:6969/announce",
  "udp://tracker1.bt.moack.co.kr:80/announce",
  "udp://explodie.org:6969/announce",
];

fn percent_encode_tracker(tracker: &str) -> String {
  let mut out = String::with_capacity(tracker.len() + 8);
  for byte in tracker.bytes() {
    match byte {
      b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
        out.push(byte as char);
      }
      _ => out.push_str(&format!("%{byte:02X}")),
    }
  }
  out
}

/// Adds public trackers to magnet links with few or no trackers (speeds up metadata fetch).
fn enrich_magnet_url(raw: &str) -> String {
  if !raw.to_ascii_lowercase().starts_with("magnet:?") {
    return raw.to_string();
  }

  let lower = raw.to_lowercase();
  let tracker_count = lower.matches("&tr=").count() + if lower.contains("?tr=") { 1 } else { 0 };
  if tracker_count >= 6 {
    return raw.to_string();
  }

  let mut enriched = raw.to_string();
  for tracker in FALLBACK_MAGNET_TRACKERS {
    if lower.contains(&tracker.to_lowercase()) {
      continue;
    }
    enriched.push_str("&tr=");
    enriched.push_str(&percent_encode_tracker(tracker));
  }
  enriched
}

fn load_sources(conn: &Connection) -> Result<Vec<SourceEntry>, String> {
  let mut stmt = conn
    .prepare("SELECT id, name, base_url FROM download_sources ORDER BY id ASC")
    .map_err(|error| format!("could_not_prepare_sources_query: {error}"))?;
  let result = stmt
    .query_map([], |row| {
      Ok(SourceEntry {
        id: row.get(0)?,
        name: row.get(1)?,
        base_url: row.get(2)?,
      })
    })
    .map_err(|error| format!("could_not_query_sources: {error}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| format!("could_not_map_sources: {error}"));
  result
}

fn load_source_by_id(conn: &Connection, id: i64) -> Result<SourceEntry, String> {
  conn
    .query_row(
      "SELECT id, name, base_url FROM download_sources WHERE id = ?1",
      params![id],
      |row| {
        Ok(SourceEntry {
          id: row.get(0)?,
          name: row.get(1)?,
          base_url: row.get(2)?,
        })
      },
    )
    .map_err(|error| format!("could_not_load_source_by_id: {error}"))
}

fn set_source_status(app: &AppHandle, source_id: i64, status: &str) {
  if let Ok(conn) = open_database_connection(app) {
    let _ = conn.execute(
      "UPDATE download_sources SET status = ?1 WHERE id = ?2",
      params![status, source_id],
    );
  }
}

async fn fetch_options_from_sources(
  app: &AppHandle,
  game_id: i64,
  game_title: &str,
  sources: &[SourceEntry],
) -> Vec<DownloadOptionDto> {
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(12))
    .build()
    .unwrap_or_else(|_| reqwest::Client::new());

  let mut options: Vec<DownloadOptionDto> = Vec::new();

  for source in sources {
    let base = source.base_url.trim_end_matches('/');
    let response = client
      .get(format!("{base}/search"))
      .query(&[
        ("query", game_title.to_string()),
        ("gameId", game_id.to_string()),
      ])
      .send()
      .await;

    let resp = match response {
      Ok(resp) => resp,
      Err(_) => {
        set_source_status(app, source.id, "failed");
        continue;
      }
    };

    if !resp.status().is_success() {
      set_source_status(app, source.id, "failed");
      continue;
    }

    let parsed_items: Vec<SourceOptionItem> = match resp.json::<Vec<SourceOptionItem>>().await {
      Ok(list) => list,
      Err(_) => {
        // tenta o formato { options: [...] } como fallback
        let fallback = client
          .get(format!("{base}/search"))
          .query(&[
            ("query", game_title.to_string()),
            ("gameId", game_id.to_string()),
          ])
          .send()
          .await;
        let Ok(fallback_resp) = fallback else {
          set_source_status(app, source.id, "failed");
          continue;
        };
        match fallback_resp.json::<SourceSearchResponse>().await {
          Ok(wrapper) => wrapper.options,
          Err(_) => {
            set_source_status(app, source.id, "failed");
            continue;
          }
        }
      }
    };

    set_source_status(app, source.id, "active");
    for item in parsed_items {
      let title = item
        .title
        .clone()
        .unwrap_or_else(|| format!("{} ({})", game_title, source.name));
      options.push(DownloadOptionDto {
        source_id: source.id.to_string(),
        source_name: source.name.clone(),
        title,
        download_type: item.download_type.unwrap_or_else(|| "http".to_string()),
        url: item.url,
        quality: item.quality.unwrap_or_else(|| "standard".to_string()),
        cover_url: None,
      });
    }
  }

  options
}

async fn search_download_options_from_local_sources(
  query: &str,
  sources: &[HydraSourceDto],
) -> Vec<DownloadOptionDto> {
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(15))
    .cookie_store(true)
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Hydra-Tauri-Launcher")
    .build()
    .unwrap_or_else(|_| reqwest::Client::new());

  let mut all: Vec<DownloadOptionDto> = Vec::new();
  for source in sources {
    if !is_fitgirl_source(source) {
      continue;
    }
    let source_options = search_fitgirl_options(&client, source, query).await;
    all.extend(source_options);
  }
  all
}

fn is_fitgirl_source(source: &HydraSourceDto) -> bool {
  let url = source.url.to_lowercase();
  let name = source.name.to_lowercase();
  url.contains("fitgirl") || name.contains("fitgirl")
}

fn fitgirl_base_url(source: &HydraSourceDto) -> String {
  let lower = source.url.to_lowercase();
  if lower.contains("fitgirl-repacks.site") {
    return "https://fitgirl-repacks.site".to_string();
  }
  "https://fitgirl-repacks.site".to_string()
}

fn create_local_hydra_source(url: &str) -> HydraSourceDto {
  let normalized_url = url.trim().to_string();
  let mut hasher = DefaultHasher::new();
  normalized_url.hash(&mut hasher);
  let source_id = format!("local_{:x}", hasher.finish());
  let name = if normalized_url.to_lowercase().contains("fitgirl") {
    "FitGirl".to_string()
  } else {
    "Fonte personalizada".to_string()
  };
  let now_ms = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis())
    .unwrap_or(0);
  HydraSourceDto {
    id: source_id,
    name,
    url: normalized_url,
    status: "MATCHED".to_string(),
    download_count: 0,
    fingerprint: None,
    created_at: now_ms.to_string(),
  }
}

async fn search_fitgirl_options(
  client: &reqwest::Client,
  source: &HydraSourceDto,
  query: &str,
) -> Vec<DownloadOptionDto> {
  let search_term = simplify_source_search_query(query);
  let base = fitgirl_base_url(source);
  let search_response = client
    .get(format!("{base}/"))
    .query(&[("s", search_term.as_str())])
    .send()
    .await;
  let Ok(search_response) = search_response else {
    return Vec::new();
  };
  if !search_response.status().is_success() {
    return Vec::new();
  }
  let search_html = match search_response.text().await {
    Ok(body) => body,
    Err(_) => return Vec::new(),
  };

  let post_links: Vec<String> = extract_fitgirl_post_links(&search_html)
    .into_iter()
    .filter(|url| !is_fitgirl_noise_post(url, ""))
    .take(8)
    .collect();
  if post_links.is_empty() {
    return Vec::new();
  }

  let mut options: Vec<DownloadOptionDto> = Vec::new();
  for post_url in post_links {
    let post_response = client.get(&post_url).send().await;
    let Ok(post_response) = post_response else {
      continue;
    };
    if !post_response.status().is_success() {
      continue;
    }
    let post_html = match post_response.text().await {
      Ok(body) => body,
      Err(_) => continue,
    };

    let title = extract_fitgirl_title(&post_html).unwrap_or_else(|| search_term.clone());
    if is_fitgirl_noise_post(&post_url, &title) || !title_matches_query(&title, query) {
      continue;
    }

    let post_cover = extract_fitgirl_cover_image(&post_html);
    let magnets = dedupe_magnets(extract_magnet_links(&post_html));
    for magnet in magnets.into_iter().take(1) {
      options.push(DownloadOptionDto {
        source_id: source.id.clone(),
        source_name: source.name.clone(),
        title: title.clone(),
        download_type: "torrent".to_string(),
        url: magnet,
        quality: "standard".to_string(),
        cover_url: post_cover.clone(),
      });
    }
    if options.len() >= 12 {
      break;
    }
  }

  options
}

struct SourceProbeCache {
  entries: HashMap<String, (bool, u64)>,
}

impl SourceProbeCache {
  fn get(&self, key: &str) -> Option<bool> {
    const TTL_MS: u64 = 30 * 60 * 1000;
    let now = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|duration| duration.as_millis())
      .unwrap_or(0) as u64;
    let (hit, at) = self.entries.get(key)?;
    if now.saturating_sub(*at) > TTL_MS {
      return None;
    }
    Some(*hit)
  }

  fn put(&mut self, key: String, hit: bool) {
    let now = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|duration| duration.as_millis())
      .unwrap_or(0) as u64;
    self.entries.insert(key, (hit, now));
  }
}

fn source_probe_cache() -> &'static Mutex<SourceProbeCache> {
  static CACHE: OnceLock<Mutex<SourceProbeCache>> = OnceLock::new();
  CACHE.get_or_init(|| Mutex::new(SourceProbeCache {
    entries: HashMap::new(),
  }))
}

fn source_probe_cache_get(key: &str) -> Option<bool> {
  source_probe_cache()
    .lock()
    .ok()
    .and_then(|cache| cache.get(key))
}

fn source_probe_cache_put(key: String, hit: bool) {
  if let Ok(mut cache) = source_probe_cache().lock() {
    cache.put(key, hit);
  }
}

fn fitgirl_slug_title(url: &str) -> String {
  let slug = url.trim_end_matches('/').rsplit('/').next().unwrap_or("");
  slug.replace('-', " ")
}

async fn quick_fitgirl_has_sources(client: &reqwest::Client, game_title: &str) -> bool {
  let cache_key = normalize_match_text(game_title);
  if cache_key.is_empty() {
    return false;
  }
  if let Some(hit) = source_probe_cache_get(&cache_key) {
    return hit;
  }

  let search_term = simplify_source_search_query(game_title);
  if search_term.trim().len() < 2 {
    source_probe_cache_put(cache_key, false);
    return false;
  }

  let base = "https://fitgirl-repacks.site";
  let search_response = client
    .get(format!("{base}/"))
    .query(&[("s", search_term.as_str())])
    .send()
    .await;
  let Ok(search_response) = search_response else {
    return false;
  };
  if !search_response.status().is_success() {
    source_probe_cache_put(cache_key, false);
    return false;
  }
  let search_html = match search_response.text().await {
    Ok(body) => body,
    Err(_) => {
      source_probe_cache_put(cache_key, false);
      return false;
    }
  };

  let post_links: Vec<String> = extract_fitgirl_post_links(&search_html)
    .into_iter()
    .filter(|url| !is_fitgirl_noise_post(url, ""))
    .take(6)
    .collect();

  for post_url in post_links {
    let slug_title = fitgirl_slug_title(&post_url);
    if !title_matches_query(&slug_title, game_title) {
      continue;
    }

    let post_response = client.get(&post_url).send().await;
    let Ok(post_response) = post_response else {
      continue;
    };
    if !post_response.status().is_success() {
      continue;
    }
    let post_html = match post_response.text().await {
      Ok(body) => body,
      Err(_) => continue,
    };

    let title = extract_fitgirl_title(&post_html).unwrap_or(slug_title);
    if is_fitgirl_noise_post(&post_url, &title) || !title_matches_query(&title, game_title) {
      continue;
    }
    if extract_magnet_links(&post_html).is_empty() {
      continue;
    }

    source_probe_cache_put(cache_key.clone(), true);
    return true;
  }

  source_probe_cache_put(cache_key, false);
  false
}

async fn game_has_active_sources(
  client: &reqwest::Client,
  sources: &[HydraSourceDto],
  game_title: &str,
) -> bool {
  for source in sources {
    if !is_fitgirl_source(source) {
      continue;
    }
    if quick_fitgirl_has_sources(client, game_title).await {
      return true;
    }
  }
  false
}

async fn filter_catalog_with_sources(
  games: Vec<CatalogGameDto>,
  sources: &[HydraSourceDto],
) -> Vec<CatalogGameDto> {
  if games.is_empty() || sources.is_empty() {
    return Vec::new();
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(8))
    .cookie_store(true)
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Hydra-Tauri-Launcher")
    .build()
    .unwrap_or_else(|_| reqwest::Client::new());

  let client = Arc::new(client);
  let mut filtered = Vec::new();

  for chunk in games.chunks(3) {
    let mut handles = Vec::new();
    for game in chunk {
      let client = client.clone();
      let title = game.title.clone();
      let sources = sources.to_vec();
      handles.push(tauri::async_runtime::spawn(async move {
        let has_source = game_has_active_sources(&client, &sources, &title).await;
        (title, has_source)
      }));
    }

    for handle in handles {
      let Ok((title, has_source)) = handle.await else {
        continue;
      };
      if !has_source {
        continue;
      }
      if let Some(game) = chunk.iter().find(|row| row.title == title) {
        filtered.push(game.clone());
      }
    }
  }

  filtered
}

async fn apply_catalog_source_filter(
  app: &AppHandle,
  games: Vec<CatalogGameDto>,
) -> Vec<CatalogGameDto> {
  let conn = match open_database_connection(app) {
    Ok(conn) => conn,
    Err(_) => return games,
  };
  let hydra_sources = list_hydra_sources(&conn).unwrap_or_default();
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn).unwrap_or_default();
  drop(conn);

  let active_sources: Vec<HydraSourceDto> = hydra_sources
    .into_iter()
    .filter(|source| !disabled.contains(&source.id))
    .collect();
  if active_sources.is_empty() {
    return Vec::new();
  }

  filter_catalog_with_sources(games, &active_sources).await
}

fn simplify_source_search_query(query: &str) -> String {
  let mut value = query
    .replace(['™', '®', '©'], "")
    .trim()
    .to_string();
  if let Some((head, _)) = value.split_once(':') {
    value = head.trim().to_string();
  }
  if let Some((head, _)) = value.split_once(" - ") {
    value = head.trim().to_string();
  }
  value
}

fn normalize_match_text(value: &str) -> String {
  value
    .to_lowercase()
    .replace(['™', '®', '©', '–', '—', '-', ':', ',', '.', '\'', '"', '’'], " ")
    .chars()
    .filter(|c| c.is_alphanumeric() || c.is_whitespace())
    .collect::<String>()
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ")
}

fn title_word_matches_query_word(title_word: &str, query_word: &str) -> bool {
  if title_word == query_word {
    return true;
  }
  // Ex.: "hades" casa com "hadesii" raro; prefixo só se a palavra do título começa com a query completa.
  query_word.len() >= 4 && title_word.starts_with(query_word)
}

fn title_matches_query(title: &str, query: &str) -> bool {
  let title_norm = normalize_match_text(title);
  let query_norm = normalize_match_text(query);
  let title_words: Vec<&str> = title_norm.split_whitespace().collect();
  let query_words: Vec<&str> = query_norm
    .split_whitespace()
    .filter(|word| !word.is_empty())
    .collect();

  if query_words.is_empty() {
    return true;
  }

  query_words.iter().all(|query_word| {
    if query_word.len() <= 2 {
      return title_words.iter().any(|title_word| title_word == query_word);
    }
    title_words
      .iter()
      .any(|title_word| title_word_matches_query_word(title_word, query_word))
  })
}

fn is_fitgirl_noise_post(url: &str, title: &str) -> bool {
  let url_l = url.to_lowercase();
  let title_l = title.to_lowercase();
  url_l.contains("updates-digest")
    || url_l.contains("/category/")
    || url_l.contains("/tag/")
    || url_l.contains("/author/")
    || url_l.contains("/popular-repacks")
    || url_l.contains("/all-my-repacks")
    || title_l.starts_with("updates digest")
    || title_l.contains("digest for ")
}

fn dedupe_magnets(magnets: Vec<String>) -> Vec<String> {
  let mut seen = HashSet::new();
  let mut out = Vec::new();
  for magnet in magnets {
    let key = magnet.to_lowercase();
    if seen.insert(key) {
      out.push(magnet);
    }
  }
  out
}

fn extract_fitgirl_post_links(html: &str) -> Vec<String> {
  let title_link_re = Regex::new(
    r#"<h[12][^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*<a[^>]*href="(https?://fitgirl-repacks\.site/[^"]+)""#,
  )
  .expect("fitgirl title link regex must compile");
  let fallback_re = Regex::new(r#"href="(https?://fitgirl-repacks\.site/[a-z0-9][a-z0-9-]*/?)""#)
    .expect("fitgirl fallback link regex must compile");
  let mut links: Vec<String> = Vec::new();

  for captures in title_link_re.captures_iter(html) {
    let Some(url_match) = captures.get(1) else {
      continue;
    };
    push_fitgirl_post_link(&mut links, url_match.as_str());
  }

  if links.is_empty() {
    for captures in fallback_re.captures_iter(html) {
      let Some(url_match) = captures.get(1) else {
        continue;
      };
      push_fitgirl_post_link(&mut links, url_match.as_str());
    }
  }

  links
}

fn push_fitgirl_post_link(links: &mut Vec<String>, raw_url: &str) {
  let url = raw_url.to_string();
  if url.contains("/wp-content/")
    || url.contains("/feed/")
    || url.contains("/search/")
    || url.contains("/tag/")
    || url.contains("/category/")
    || url.contains("/author/")
    || url.contains("/comments/")
    || url.ends_with(".js")
    || url.ends_with(".css")
    || is_fitgirl_noise_post(&url, "")
  {
    return;
  }
  if !links.contains(&url) {
    links.push(url);
  }
}

fn extract_magnet_links(html: &str) -> Vec<String> {
  let magnet_re = Regex::new(r#"magnet:\?xt=urn:[^"'<\s]+"#).expect("magnet regex must compile");
  let mut magnets: Vec<String> = Vec::new();
  for matched in magnet_re.find_iter(html) {
    let magnet = matched
      .as_str()
      .replace("&#038;", "&")
      .replace("&amp;", "&");
    if !magnets.contains(&magnet) {
      magnets.push(magnet);
    }
  }
  magnets
}

fn extract_fitgirl_title(html: &str) -> Option<String> {
  let title_re = Regex::new(r#"<title>([^<]+)</title>"#).expect("title regex must compile");
  let captures = title_re.captures(html)?;
  let title = captures.get(1)?.as_str().trim();
  if title.is_empty() {
    None
  } else {
    Some(title.replace(" - FitGirl Repacks", "").trim().to_string())
  }
}

fn extract_fitgirl_cover_image(html: &str) -> Option<String> {
  static OG_IMAGE: OnceLock<Regex> = OnceLock::new();
  let re = OG_IMAGE.get_or_init(|| {
    Regex::new(r#"(?i)<meta\s+property="og:image"\s+content="([^"]+)""#)
      .expect("og:image regex must compile")
  });
  let url = re.captures(html)?.get(1)?.as_str().trim();
  if url.starts_with("http") && !url.to_lowercase().contains("logo") {
    Some(url.to_string())
  } else {
    None
  }
}

fn clean_title_for_cover(title: &str) -> String {
  let mut value = title
    .replace(['™', '®', '©'], "")
    .trim()
    .to_string();
  value = Regex::new(r"(?i)\(.*?fitgirl.*?\)")
    .ok()
    .and_then(|re| Some(re.replace_all(&value, "").to_string()))
    .unwrap_or(value);
  value = Regex::new(r"(?i)fitgirl[- ]?repack")
    .ok()
    .and_then(|re| Some(re.replace_all(&value, "").to_string()))
    .unwrap_or(value);
  value = Regex::new(r"\[.*?\]")
    .ok()
    .and_then(|re| Some(re.replace_all(&value, "").to_string()))
    .unwrap_or(value);
  for sep in ['–', '—'] {
    if let Some((head, _)) = value.split_once(sep) {
      value = head.trim().to_string();
      break;
    }
  }
  if let Some((head, _)) = value.split_once(" - v") {
    value = head.trim().to_string();
  }
  if let Some((head, _)) = value.split_once(" + ") {
    value = head.trim().to_string();
  }
  value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn hydra_api_base_url() -> String {
  std::env::var("HYDRA_API_URL").unwrap_or_else(|_| "https://api.hydralauncher.gg".to_string())
}

fn hydra_http_client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .timeout(Duration::from_secs(20))
    .build()
    .map_err(|error| format!("could_not_create_hydra_client: {error}"))
}

async fn hydra_check_download_sources_changes(
  source_ids: &[String],
  games: &[(i64, String)],
) -> Result<Vec<(i64, i64)>, String> {
  let client = hydra_http_client()?;
  let since = "1970-01-01T00:00:00.000Z".to_string();
  let response = client
    .post(format!("{}/download-sources/changes", hydra_api_base_url()))
    .json(&serde_json::json!({
      "downloadSourceIds": source_ids,
      "games": games
        .iter()
        .map(|(id, _)| serde_json::json!({ "shop": "custom", "objectId": id.to_string() }))
        .collect::<Vec<_>>(),
      "since": since
    }))
    .send()
    .await
    .map_err(|error| format!("hydra_changes_request_failed: {error}"))?;

  if !response.status().is_success() {
    return Ok(Vec::new());
  }

  let parsed = response
    .json::<Vec<HydraChangesResponseItem>>()
    .await
    .map_err(|error| format!("hydra_changes_parse_failed: {error}"))?;

  let mut mapped: Vec<(i64, i64)> = Vec::new();
  for item in parsed {
    if item.shop != "custom" {
      continue;
    }
    if let Ok(game_id) = item.object_id.parse::<i64>() {
      mapped.push((game_id, item.new_download_options_count));
    }
  }

  for (game_id, _) in games {
    if !mapped.iter().any(|(id, _)| id == game_id) {
      mapped.push((*game_id, 0));
    }
  }

  Ok(mapped)
}

fn upsert_hydra_source(conn: &Connection, source: &HydraSourceDto) -> Result<(), String> {
  conn
    .execute(
      "INSERT INTO hydra_download_sources (id, name, url, status, download_count, fingerprint, created_at) \
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
       ON CONFLICT(id) DO UPDATE SET \
       name = excluded.name, \
       url = excluded.url, \
       status = excluded.status, \
       download_count = excluded.download_count, \
       fingerprint = excluded.fingerprint",
      params![
        source.id,
        source.name,
        source.url,
        source.status,
        source.download_count,
        source.fingerprint,
        source.created_at
      ],
    )
    .map_err(|error| format!("could_not_upsert_hydra_source: {error}"))?;
  Ok(())
}

fn list_hydra_sources(conn: &Connection) -> Result<Vec<HydraSourceDto>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT id, name, url, status, download_count, fingerprint, created_at \
       FROM hydra_download_sources ORDER BY created_at DESC",
    )
    .map_err(|error| format!("could_not_prepare_list_hydra_sources: {error}"))?;
  let result = stmt
    .query_map([], |row| {
      Ok(HydraSourceDto {
        id: row.get(0)?,
        name: row.get(1)?,
        url: row.get(2)?,
        status: row.get(3)?,
        download_count: row.get(4)?,
        fingerprint: row.get(5)?,
        created_at: row.get(6)?,
      })
    })
    .map_err(|error| format!("could_not_query_hydra_sources: {error}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| format!("could_not_map_hydra_sources: {error}"));
  result
}

fn open_database_connection(app: &AppHandle) -> Result<Connection, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("could_not_get_app_data_dir: {e}"))?;
  std::fs::create_dir_all(&dir).map_err(|e| format!("could_not_create_app_data_dir: {e}"))?;
  let conn = Connection::open(dir.join("launcher.db"))
    .map_err(|e| format!("could_not_open_db: {e}"))?;
  initialize_database(&conn)?;
  ensure_default_hydra_sources(&conn)?;
  Ok(conn)
}

/// Garante pelo menos uma fonte reconhecida (FitGirl) para pesquisa em Explorar funcionar sem configuração manual.
fn ensure_default_hydra_sources(conn: &Connection) -> Result<(), String> {
  let count: i64 = conn
    .query_row("SELECT COUNT(*) FROM hydra_download_sources", [], |row| {
      row.get(0)
    })
    .map_err(|e| format!("could_not_count_hydra_sources: {e}"))?;
  if count > 0 {
    return Ok(());
  }
  let default = create_local_hydra_source("https://fitgirl-repacks.site/");
  upsert_hydra_source(conn, &default)
    .map_err(|e| format!("could_not_seed_default_hydra_source: {e}"))
}

fn initialize_database(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      "
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA synchronous=NORMAL;

      CREATE TABLE IF NOT EXISTS download_sources (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        base_url    TEXT    NOT NULL UNIQUE,
        status      TEXT    NOT NULL DEFAULT 'active',
        created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS games (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT    NOT NULL,
        install_path TEXT    NOT NULL,
        is_favorite  INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS download_jobs (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        title            TEXT    NOT NULL,
        url              TEXT    NOT NULL,
        dest_path        TEXT    NOT NULL,
        status           TEXT    NOT NULL DEFAULT 'pending',
        priority         INTEGER NOT NULL DEFAULT 0,
        progress         INTEGER NOT NULL DEFAULT 0,
        bytes_downloaded INTEGER NOT NULL DEFAULT 0,
        total_bytes      INTEGER NOT NULL DEFAULT 0,
        error_msg        TEXT,
        created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS collections (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL UNIQUE,
        created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS collection_games (
        collection_id INTEGER NOT NULL,
        game_id       INTEGER NOT NULL,
        PRIMARY KEY (collection_id, game_id),
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        FOREIGN KEY (game_id)       REFERENCES games(id)       ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS download_source_changes (
        game_id    INTEGER PRIMARY KEY,
        new_count  INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS hydra_download_sources (
        id             TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        url            TEXT NOT NULL,
        status         TEXT NOT NULL,
        download_count INTEGER NOT NULL DEFAULT 0,
        fingerprint    TEXT,
        created_at     TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS extraction_log (
        job_id       TEXT PRIMARY KEY,
        status       TEXT NOT NULL,
        archive_path TEXT,
        extract_path TEXT,
        error        TEXT,
        updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS catalog_steam_cache (
        query_norm   TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        fetched_ts   INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS game_covers (
        title_key   TEXT PRIMARY KEY,
        cover_url   TEXT NOT NULL,
        local_path  TEXT,
        updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS library_game_roots (
        library_key TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        dest_path   TEXT NOT NULL,
        game_root   TEXT NOT NULL,
        updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ",
    )
    .map_err(|e| format!("could_not_initialize_database: {e}"))?;
  migrate_catalog_steam_cache_hd_covers(conn)
}

fn normalize_title_key(title: &str) -> String {
  let cleaned = title
    .to_lowercase()
    .replace(['™', '®', '©'], "")
    .chars()
    .map(|c| {
      if c.is_alphanumeric() || c == ' ' {
        c
      } else {
        ' '
      }
    })
    .collect::<String>();
  cleaned
    .split_whitespace()
    .take(6)
    .collect::<Vec<_>>()
    .join(" ")
}

fn covers_dir_for_app(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("could_not_resolve_app_data_dir: {e}"))?
    .join("covers");
  fs::create_dir_all(&dir).map_err(|e| format!("could_not_create_covers_dir: {e}"))?;
  Ok(dir)
}

fn is_valid_cover_bytes(bytes: &[u8]) -> bool {
  if bytes.len() < 256 {
    return false;
  }
  if bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
    return true;
  }
  if bytes.len() >= 8 && bytes[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
    return true;
  }
  if bytes.len() >= 12 && bytes[0..4] == *b"RIFF" && bytes[8..12] == *b"WEBP" {
    return true;
  }
  if bytes.len() >= 6 && (bytes[0..6] == *b"GIF87a" || bytes[0..6] == *b"GIF89a") {
    return true;
  }
  false
}

fn is_usable_cover_file(path: &Path, covers_dir: &Path) -> bool {
  if !path.is_file() {
    return false;
  }
  let Ok(meta) = fs::metadata(path) else {
    return false;
  };
  if meta.len() < 256 {
    return false;
  }
  let Ok(canon_file) = path.canonicalize() else {
    return false;
  };
  let Ok(canon_dir) = covers_dir.canonicalize() else {
    return false;
  };
  if !canon_file.starts_with(&canon_dir) {
    return false;
  }
  let Ok(bytes) = fs::read(path) else {
    return false;
  };
  is_valid_cover_bytes(&bytes)
}

fn cover_download_urls(cover_url: &str) -> Vec<String> {
  let trimmed = cover_url.trim();
  let mut urls = Vec::new();
  if let Some(rest) = trimmed.split("/steam/apps/").nth(1) {
    if let Some(app_id) = rest.split('/').next().filter(|id| !id.is_empty()) {
      urls.push(format!(
        "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_600x900.jpg"
      ));
      urls.push(format!(
        "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_600x900_2x.jpg"
      ));
      urls.push(format!(
        "https://steamcdn-a.akamaihd.net/steam/apps/{app_id}/library_600x900.jpg"
      ));
      urls.push(format!(
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{app_id}/library_600x900.jpg"
      ));
      urls.push(format!(
        "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/header.jpg"
      ));
      urls.push(format!(
        "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/capsule_616x353.jpg"
      ));
    }
  }
  urls.push(trimmed.to_string());
  let mut seen = HashSet::new();
  urls.retain(|url| seen.insert(url.clone()));
  urls
}

async fn fetch_cover_bytes(client: &reqwest::Client, cover_url: &str) -> Option<Vec<u8>> {
  for attempt in 0..2 {
    match client.get(cover_url).send().await {
      Ok(response) if response.status().is_success() => {
        if let Ok(bytes) = response.bytes().await {
          if is_valid_cover_bytes(&bytes) {
            return Some(bytes.to_vec());
          }
        }
      }
      Ok(response)
        if !response.status().is_server_error() && response.status().as_u16() != 429 =>
      {
        break;
      }
      Ok(_) | Err(_) => {}
    }
    if attempt + 1 < 2 {
      sleep(Duration::from_millis(350 * (attempt as u64 + 1))).await;
    }
  }
  None
}

fn remove_cover_file(path: &str) {
  let _ = fs::remove_file(path);
}

/// Insere ou atualiza a URL da capa. Se a URL mudar, devolve o `local_path` antigo para apagar o ficheiro.
fn upsert_game_cover(
  conn: &Connection,
  title: &str,
  cover_url: &str,
) -> Result<Option<String>, String> {
  let title_key = normalize_title_key(title);
  if title_key.is_empty() || cover_url.trim().is_empty() {
    return Ok(None);
  }
  let trimmed = cover_url.trim();

  let stale_local: Option<String> = conn
    .query_row(
      "SELECT local_path FROM game_covers WHERE title_key = ?1 AND cover_url != ?2",
      params![title_key, trimmed],
      |row| row.get(0),
    )
    .ok()
    .flatten();

  conn
    .execute(
      "INSERT INTO game_covers (title_key, cover_url, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP) \
       ON CONFLICT(title_key) DO UPDATE SET \
         cover_url = excluded.cover_url, \
         local_path = CASE WHEN game_covers.cover_url != excluded.cover_url THEN NULL ELSE game_covers.local_path END, \
         updated_at = CURRENT_TIMESTAMP",
      params![title_key, trimmed],
    )
    .map_err(|e| format!("could_not_upsert_game_cover: {e}"))?;
  Ok(stale_local)
}

async fn download_and_cache_cover(
  app: &AppHandle,
  title: &str,
  cover_url: &str,
) -> Result<Option<String>, String> {
  let title_key = normalize_title_key(title);
  if title_key.is_empty() {
    return Ok(None);
  }

  let covers_dir = covers_dir_for_app(app)?;

  let mut hasher = DefaultHasher::new();
  title_key.hash(&mut hasher);
  cover_url.hash(&mut hasher);
  let file_name = format!("{:x}.jpg", hasher.finish());
  let file_path = covers_dir.join(file_name);

  if file_path.exists() && !is_usable_cover_file(&file_path, &covers_dir) {
    remove_cover_file(&file_path.to_string_lossy());
  }

  if is_usable_cover_file(&file_path, &covers_dir) {
    let local_path = file_path.to_string_lossy().to_string();
    let conn = open_database_connection(app)?;
    conn
      .execute(
        "UPDATE game_covers SET local_path = ?1, updated_at = CURRENT_TIMESTAMP WHERE title_key = ?2",
        params![local_path, title_key],
      )
      .map_err(|e| format!("could_not_update_cover_local_path: {e}"))?;
    return Ok(Some(local_path));
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(20))
    .user_agent("MyLauncher/1.0")
    .build()
    .map_err(|e| format!("could_not_create_http_client: {e}"))?;

  let mut downloaded: Option<Vec<u8>> = None;
  for candidate_url in cover_download_urls(cover_url) {
    if let Some(bytes) = fetch_cover_bytes(&client, &candidate_url).await {
      downloaded = Some(bytes);
      break;
    }
  }

  let Some(bytes) = downloaded else {
    eprintln!("cover_cache_miss: all candidates failed for {title_key}");
    return Ok(None);
  };
  fs::write(&file_path, &bytes).map_err(|e| format!("could_not_write_cover_cache: {e}"))?;

  let local_path = file_path.to_string_lossy().to_string();
  let conn = open_database_connection(app)?;
  conn
    .execute(
      "UPDATE game_covers SET local_path = ?1, updated_at = CURRENT_TIMESTAMP WHERE title_key = ?2",
      params![local_path, title_key],
    )
    .map_err(|e| format!("could_not_update_cover_local_path: {e}"))?;
  Ok(Some(local_path))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GameCoverDto {
  title_key: String,
  cover_url: String,
  local_path: Option<String>,
}

#[tauri::command]
fn list_game_covers(app: AppHandle) -> Result<Vec<GameCoverDto>, String> {
  let covers_dir = covers_dir_for_app(&app)?;
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare("SELECT title_key, cover_url, local_path FROM game_covers ORDER BY updated_at DESC")
    .map_err(|e| format!("could_not_prepare_list_game_covers: {e}"))?;
  let rows = stmt
    .query_map([], |row| {
      let local_path: Option<String> = row.get(2)?;
      let local_path = local_path.filter(|path| is_usable_cover_file(Path::new(path), &covers_dir));
      Ok(GameCoverDto {
        title_key: row.get(0)?,
        cover_url: row.get(1)?,
        local_path,
      })
    })
    .map_err(|e| format!("could_not_query_game_covers: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_game_covers: {e}"))?;
  Ok(rows)
}

#[tauri::command]
async fn ensure_game_cover_cached(app: AppHandle, title: String) -> Result<Option<String>, String> {
  let conn = open_database_connection(&app)?;
  let title_key = normalize_title_key(&title);
  let (cover_url, local_path): (String, Option<String>) = match conn.query_row(
    "SELECT cover_url, local_path FROM game_covers WHERE title_key = ?1",
    params![title_key],
    |row| Ok((row.get(0)?, row.get(1)?)),
  ) {
    Ok(row) => row,
    Err(_) => return Ok(None),
  };
  drop(conn);

  let covers_dir = covers_dir_for_app(&app)?;
  if let Some(path) = local_path {
    if is_usable_cover_file(Path::new(&path), &covers_dir) {
      return Ok(Some(path));
    }
    remove_cover_file(&path);
    let conn = open_database_connection(&app)?;
    conn
      .execute(
        "UPDATE game_covers SET local_path = NULL WHERE title_key = ?1",
        params![title_key],
      )
      .map_err(|e| format!("could_not_clear_cover_local_path: {e}"))?;
  }
  download_and_cache_cover(&app, &title, &cover_url).await
}

#[tauri::command]
fn invalidate_game_cover_local(app: AppHandle, title: String) -> Result<(), String> {
  let title_key = normalize_title_key(&title);
  if title_key.is_empty() {
    return Ok(());
  }
  let conn = open_database_connection(&app)?;
  let local_path: Option<String> = conn
    .query_row(
      "SELECT local_path FROM game_covers WHERE title_key = ?1",
      params![title_key],
      |row| row.get(0),
    )
    .unwrap_or(None);
  conn
    .execute(
      "UPDATE game_covers SET local_path = NULL WHERE title_key = ?1",
      params![title_key],
    )
    .map_err(|e| format!("could_not_clear_cover_local_path: {e}"))?;
  if let Some(path) = local_path {
    remove_cover_file(&path);
  }
  Ok(())
}

#[tauri::command]
async fn save_game_cover(app: AppHandle, title: String, cover_url: String) -> Result<(), String> {
  let trimmed = cover_url.trim().to_string();
  if trimmed.is_empty() {
    return Ok(());
  }

  let stale = {
    let conn = open_database_connection(&app)?;
    upsert_game_cover(&conn, &title, &trimmed)?
  };
  if let Some(path) = stale {
    remove_cover_file(&path);
  }

  let covers_dir = covers_dir_for_app(&app)?;
  let needs_download = {
    let conn = open_database_connection(&app)?;
    let title_key = normalize_title_key(&title);
    let local_path: Option<String> = conn
      .query_row(
        "SELECT local_path FROM game_covers WHERE title_key = ?1",
        params![title_key],
        |row| row.get(0),
      )
      .unwrap_or(None);
    !local_path
      .as_deref()
      .is_some_and(|path| is_usable_cover_file(Path::new(path), &covers_dir))
  };

  if needs_download {
    let app_bg = app.clone();
    let title_bg = title.clone();
    tauri::async_runtime::spawn(async move {
      let _ = download_and_cache_cover(&app_bg, &title_bg, &trimmed).await;
    });
  }

  Ok(())
}

#[tauri::command]
fn check_path_playable(app: AppHandle, payload: LaunchGamePayload) -> bool {
  let extra_roots = launch_extra_roots(
    &app,
    &payload.title,
    &payload.path,
    payload.job_id.as_deref(),
  );
  launch::resolve_launch_candidates_with_extra_roots(&payload.title, &payload.path, &extra_roots).is_ok()
}

/// Invalida cache do catálogo Steam uma vez após passar a gravar URLs de cápsula HD em vez de `tiny_image`.
fn migrate_catalog_steam_cache_hd_covers(conn: &Connection) -> Result<(), String> {
  const KEY: &str = "catalog_steam_cache_hd_covers_v1";
  let already: Option<String> = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = ?1",
      params![KEY],
      |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| format!("migrate_catalog_cache_read: {e}"))?;
  if already.is_some() {
    return Ok(());
  }
  conn
    .execute("DELETE FROM catalog_steam_cache", [])
    .map_err(|e| format!("migrate_catalog_cache_clear: {e}"))?;
  conn
    .execute(
      "INSERT INTO app_settings (key, value) VALUES (?1, '1')",
      params![KEY],
    )
    .map_err(|e| format!("migrate_catalog_cache_mark: {e}"))?;
  Ok(())
}

const EMBEDDED_CATALOG_JSON: &str = include_str!("../resources/embedded_catalog.json");

fn embedded_catalog_entries() -> Vec<EmbeddedCatalogEntry> {
  serde_json::from_str(EMBEDDED_CATALOG_JSON).unwrap_or_else(|_| Vec::new())
}

fn stable_embedded_id(title: &str) -> String {
  let mut hasher = DefaultHasher::new();
  title.hash(&mut hasher);
  format!("emb_{:x}", hasher.finish())
}

/// Cápsula vertical otimizada para grelha (~600×900). Mais leve que a variante @2x.
fn steam_grid_cover(app_id: u32) -> String {
  format!(
    "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_600x900.jpg",
    app_id
  )
}

fn is_likely_dlc_item(item: &serde_json::Value, title: &str) -> bool {
  let title_norm = title.to_lowercase();
  if title_norm.contains(" dlc")
    || title_norm.contains("dlc ")
    || title_norm.contains("soundtrack")
    || title_norm.contains("ost")
    || title_norm.contains("season pass")
    || title_norm.contains("expansion pass")
    || title_norm.contains("skin pack")
    || title_norm.contains("cosmetic pack")
    || title_norm.contains("booster pack")
  {
    return true;
  }

  let item_type = item
    .get("type")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_lowercase();
  if item_type == "dlc" {
    return true;
  }

  let item_type_label = item
    .get("type_label")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_lowercase();
  if item_type_label.contains("dlc") {
    return true;
  }

  false
}

fn embedded_entry_to_dto(entry: &EmbeddedCatalogEntry) -> CatalogGameDto {
  CatalogGameDto {
    id: stable_embedded_id(&entry.title),
    title: entry.title.clone(),
    genre: entry.genre.clone(),
    cover_url: entry.steam_app_id.map(steam_grid_cover),
    source: "embedded".to_string(),
  }
}

fn filter_embedded_catalog(query_norm: &str) -> Vec<CatalogGameDto> {
  let entries = embedded_catalog_entries();
  let mut out = Vec::new();
  if query_norm.is_empty() {
    for e in entries.into_iter().take(24) {
      out.push(embedded_entry_to_dto(&e));
    }
    return out;
  }
  for e in entries {
    let t = e.title.to_lowercase();
    let g = e.genre.to_lowercase();
    if t.contains(query_norm) || g.contains(query_norm) {
      out.push(embedded_entry_to_dto(&e));
    }
  }
  out
}

fn steam_cache_get(conn: &Connection, query_norm: &str) -> Option<Vec<CatalogGameDto>> {
  let now = i64::try_from(
    SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .ok()?
      .as_secs(),
  )
  .ok()?;
  let row_result = conn.query_row(
    "SELECT payload_json, fetched_ts FROM catalog_steam_cache WHERE query_norm = ?1",
    params![query_norm],
    |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
  );
  let (json, ts) = match row_result.optional() {
    Ok(Some(pair)) => pair,
    Ok(None) | Err(_) => return None,
  };
  if now - ts > 86_400 {
    return None;
  }
  serde_json::from_str(&json).ok()
}

fn steam_cache_put(conn: &Connection, query_norm: &str, games: &[CatalogGameDto]) -> Result<(), String> {
  let json = serde_json::to_string(games).map_err(|e| format!("steam_cache_encode: {e}"))?;
  let ts = i64::try_from(
    SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap_or_default()
      .as_secs(),
  )
  .unwrap_or(0);
  conn
    .execute(
      "INSERT INTO catalog_steam_cache (query_norm, payload_json, fetched_ts) VALUES (?1, ?2, ?3) \
       ON CONFLICT(query_norm) DO UPDATE SET \
       payload_json = excluded.payload_json, fetched_ts = excluded.fetched_ts",
      params![query_norm, json, ts],
    )
    .map_err(|e| format!("steam_cache_put: {e}"))?;
  Ok(())
}

async fn fetch_steam_catalog_games(search_term: &str) -> Result<Vec<CatalogGameDto>, String> {
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(4))
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Hydra-Tauri-Launcher/1.0")
    .build()
    .map_err(|e| format!("steam_client_build: {e}"))?;

  let response = client
    .get("https://store.steampowered.com/api/storesearch/")
    .query(&[("term", search_term), ("cc", "US"), ("l", "en")])
    .send()
    .await
    .map_err(|e| format!("steam_catalog_request_failed: {e}"))?;

  if !response.status().is_success() {
    return Err(format!("steam_catalog_http_{}", response.status()));
  }

  let value: serde_json::Value = response
    .json()
    .await
    .map_err(|e| format!("steam_catalog_parse_failed: {e}"))?;

  let mut out = Vec::new();
  let Some(items) = value.get("items").and_then(|v| v.as_array()) else {
    return Ok(out);
  };

  for item in items.iter().take(24) {
    let Some(app_id) = item.get("id").and_then(|v| v.as_u64()).map(|v| v as u32) else {
      continue;
    };
    let title = item
      .get("name")
      .and_then(|v| v.as_str())
      .unwrap_or("")
      .trim()
      .to_string();
    if title.is_empty() {
      continue;
    }
    if is_likely_dlc_item(item, &title) {
      continue;
    }
    let cover = Some(steam_grid_cover(app_id));

    out.push(CatalogGameDto {
      id: format!("steam_{app_id}"),
      title,
      genre: "Steam".to_string(),
      cover_url: cover,
      source: "steam".to_string(),
    });
  }

  Ok(out)
}

fn embedded_cover_for_title(title: &str) -> Option<String> {
  let cleaned = clean_title_for_cover(title);
  for candidate in [cleaned.as_str(), title] {
    for entry in embedded_catalog_entries() {
      if title_matches_query(&entry.title, candidate) {
        if let Some(cover) = entry.steam_app_id.map(steam_grid_cover) {
          return Some(cover);
        }
      }
    }
  }

  let title_norm = normalize_match_text(&cleaned);
  if title_norm.is_empty() {
    return None;
  }

  let mut best: Option<(usize, u32)> = None;
  for entry in embedded_catalog_entries() {
    let Some(app_id) = entry.steam_app_id else {
      continue;
    };
    let entry_norm = normalize_match_text(&entry.title);
    if entry_norm.is_empty() {
      continue;
    }
    let matches = title_norm.contains(&entry_norm) || entry_norm.contains(&title_norm);
    if !matches {
      continue;
    }
    let score = entry_norm.len();
    if best.map(|(best_score, _)| score > best_score).unwrap_or(true) {
      best = Some((score, app_id));
    }
  }

  best.map(|(_, app_id)| steam_grid_cover(app_id))
}

fn cover_resolve_cache() -> &'static Mutex<HashMap<String, Option<String>>> {
  static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
  CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cover_cache_get(key: &str) -> Option<Option<String>> {
  cover_resolve_cache()
    .lock()
    .ok()
    .and_then(|cache| cache.get(key).cloned())
}

fn cover_cache_put(key: String, value: Option<String>) {
  if let Ok(mut cache) = cover_resolve_cache().lock() {
    cache.insert(key, value);
  }
}

async fn fetch_steam_cover_url_for_title(title: &str) -> Option<String> {
  let cleaned = clean_title_for_cover(title);
  if cleaned.len() < 2 {
    return None;
  }
  let games = fetch_steam_catalog_games(&cleaned).await.ok()?;
  games
    .into_iter()
    .find(|game| title_matches_query(&game.title, &cleaned))
    .and_then(|game| game.cover_url)
}

async fn resolve_repack_cover_url(title: &str, source_cover: Option<String>) -> Option<String> {
  if let Some(url) = source_cover.filter(|value| !value.trim().is_empty()) {
    return Some(url);
  }

  let cache_key = normalize_match_text(title);
  if !cache_key.is_empty() {
    if let Some(cached) = cover_cache_get(&cache_key) {
      return cached;
    }
  }

  let resolved = if let Some(url) = embedded_cover_for_title(title) {
    Some(url)
  } else {
    fetch_steam_cover_url_for_title(title).await
  };

  if !cache_key.is_empty() {
    cover_cache_put(cache_key, resolved.clone());
  }

  resolved
}

async fn search_catalog_from_sources(app: &AppHandle, query: &str) -> Result<Vec<CatalogGameDto>, String> {
  let conn = open_database_connection(app)?;
  let hydra_sources = list_hydra_sources(&conn)?;
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn)?;
  drop(conn);

  let active_sources: Vec<HydraSourceDto> = hydra_sources
    .into_iter()
    .filter(|source| !disabled.contains(&source.id))
    .collect();

  if active_sources.is_empty() {
    return Ok(Vec::new());
  }

  let options = search_download_options_from_local_sources(query, &active_sources).await;
  let mut seen = HashSet::new();
  let mut games = Vec::new();
  let mut pending_covers: Vec<(usize, String, Option<String>)> = Vec::new();

  for option in options {
    if option.download_type != "torrent" {
      continue;
    }
    let key = normalize_match_text(&option.title);
    if key.is_empty() || seen.contains(&key) {
      continue;
    }
    seen.insert(key);

    let title = option.title;
    let source_cover = option.cover_url.clone();
    games.push(CatalogGameDto {
      id: format!("source:{}", stable_embedded_id(&title)),
      title: title.clone(),
      genre: option.source_name,
      cover_url: None,
      source: "source".to_string(),
    });
    pending_covers.push((games.len() - 1, title, source_cover));

    if games.len() >= 56 {
      break;
    }
  }

  for chunk in pending_covers.chunks(4) {
    let mut handles = Vec::new();
    for (index, title, source_cover) in chunk {
      let title = title.clone();
      let source_cover = source_cover.clone();
      handles.push((
        *index,
        tauri::async_runtime::spawn(async move {
          resolve_repack_cover_url(&title, source_cover).await
        }),
      ));
    }
    for (index, handle) in handles {
      if let Ok(url) = handle.await {
        if let Some(game) = games.get_mut(index) {
          game.cover_url = url;
        }
      }
    }
  }

  Ok(games)
}

#[tauri::command]
async fn resolve_game_cover_url(title: String) -> Result<Option<String>, String> {
  Ok(resolve_repack_cover_url(title.trim(), None).await)
}

#[tauri::command]
async fn search_game_catalog(app: AppHandle, payload: SearchCatalogPayload) -> Result<Vec<CatalogGameDto>, String> {
  let trimmed = payload.query.trim();
  let query_norm = trimmed.to_lowercase();
  let only_with_sources = payload.only_with_sources.unwrap_or(false);

  if query_norm.len() < 2 {
    return Ok(Vec::new());
  }

  if only_with_sources {
    return search_catalog_from_sources(&app, trimmed).await;
  }

  let mut merged = filter_embedded_catalog(&query_norm);
  let mut seen: HashSet<String> = merged.iter().map(|g| g.title.to_lowercase()).collect();

  let include_steam = payload.include_steam.unwrap_or(true);
  if !include_steam {
    let mut out: Vec<CatalogGameDto> = merged.into_iter().take(56).collect();
    return Ok(out);
  }

  let conn = open_database_connection(&app)?;

  let steam_chunk = if let Some(cached) = steam_cache_get(&conn, &query_norm) {
    cached
  } else {
    drop(conn);
    let fetched = fetch_steam_catalog_games(trimmed).await.unwrap_or_default();
    if !fetched.is_empty() {
      if let Ok(conn) = open_database_connection(&app) {
        let _ = steam_cache_put(&conn, &query_norm, &fetched);
      }
    }
    fetched
  };

  for game in steam_chunk {
    let key = game.title.to_lowercase();
    if seen.contains(&key) {
      continue;
    }
    seen.insert(key);
    merged.push(game);
    if merged.len() >= 56 {
      break;
    }
  }

  let mut out: Vec<CatalogGameDto> = merged.into_iter().take(56).collect();
  if only_with_sources {
    out = apply_catalog_source_filter(&app, out).await;
  }

  Ok(out)
}

fn fetch_source_by_id(conn: &Connection, id: i64) -> Result<SourceDto, String> {
  conn
    .query_row(
      "SELECT id, name, base_url, status, created_at FROM download_sources WHERE id = ?1",
      params![id],
      |row| {
        Ok(SourceDto {
          id: row.get(0)?,
          name: row.get(1)?,
          base_url: row.get(2)?,
          status: row.get(3)?,
          created_at: row.get(4)?,
        })
      },
    )
    .map_err(|e| format!("could_not_fetch_source: {e}"))
}

fn fetch_game_by_id(conn: &Connection, id: i64) -> Result<GameDto, String> {
  conn
    .query_row(
      "SELECT g.id, g.title, g.install_path, g.is_favorite, \
       COALESCE(dsc.new_count, 0), g.created_at \
       FROM games g \
       LEFT JOIN download_source_changes dsc ON dsc.game_id = g.id \
       WHERE g.id = ?1",
      params![id],
      |row| {
        Ok(GameDto {
          id: row.get(0)?,
          title: row.get(1)?,
          install_path: row.get(2)?,
          is_favorite: row.get::<_, i64>(3)? == 1,
          new_download_options_count: row.get(4)?,
          created_at: row.get(5)?,
        })
      },
    )
    .map_err(|e| format!("could_not_fetch_game: {e}"))
}

fn map_job_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DownloadJobDto> {
  Ok(DownloadJobDto {
    id: row.get(0)?,
    title: row.get(1)?,
    url: row.get(2)?,
    dest_path: row.get(3)?,
    status: row.get(4)?,
    priority: row.get(5)?,
    progress: row.get(6)?,
    bytes_downloaded: row.get(7)?,
    total_bytes: row.get(8)?,
    error_msg: row.get(9)?,
    created_at: row.get(10)?,
    updated_at: row.get(11)?,
  })
}

fn fetch_job_by_id(conn: &Connection, id: i64) -> Result<DownloadJobDto, String> {
  conn
    .query_row(
      "SELECT id, title, url, dest_path, status, priority, progress, bytes_downloaded, \
       total_bytes, error_msg, created_at, updated_at FROM download_jobs WHERE id = ?1",
      params![id],
      map_job_row,
    )
    .map_err(|e| format!("could_not_fetch_job: {e}"))
}

// ── Commands: Collections ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct CreateCollectionPayload {
  name: String,
}

#[derive(Debug, Deserialize)]
struct CollectionIdPayload {
  id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CollectionGamePayload {
  collection_id: i64,
  game_id: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CollectionDto {
  id: i64,
  name: String,
  game_count: i64,
  created_at: String,
}

#[tauri::command]
fn create_collection(app: AppHandle, payload: CreateCollectionPayload) -> Result<CollectionDto, String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "INSERT INTO collections (name) VALUES (?1)",
      params![payload.name.trim()],
    )
    .map_err(|e| format!("could_not_create_collection: {e}"))?;
  let id = conn.last_insert_rowid();
  fetch_collection_by_id(&conn, id)
}

#[tauri::command]
fn list_collections(app: AppHandle) -> Result<Vec<CollectionDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare(
      "SELECT c.id, c.name, COUNT(cg.game_id) as game_count, c.created_at \
       FROM collections c \
       LEFT JOIN collection_games cg ON c.id = cg.collection_id \
       GROUP BY c.id ORDER BY c.id DESC",
    )
    .map_err(|e| format!("could_not_prepare_list_collections: {e}"))?;
  let result = stmt
    .query_map([], |row| {
      Ok(CollectionDto {
        id: row.get(0)?,
        name: row.get(1)?,
        game_count: row.get(2)?,
        created_at: row.get(3)?,
      })
    })
    .map_err(|e| format!("could_not_query_collections: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_collections: {e}"));
  result
}

#[tauri::command]
fn delete_collection(app: AppHandle, payload: CollectionIdPayload) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute("DELETE FROM collections WHERE id = ?1", params![payload.id])
    .map_err(|e| format!("could_not_delete_collection: {e}"))?;
  Ok(())
}

#[tauri::command]
fn add_game_to_collection(app: AppHandle, payload: CollectionGamePayload) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "INSERT OR IGNORE INTO collection_games (collection_id, game_id) VALUES (?1, ?2)",
      params![payload.collection_id, payload.game_id],
    )
    .map_err(|e| format!("could_not_add_game_to_collection: {e}"))?;
  Ok(())
}

#[tauri::command]
fn remove_game_from_collection(app: AppHandle, payload: CollectionGamePayload) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "DELETE FROM collection_games WHERE collection_id = ?1 AND game_id = ?2",
      params![payload.collection_id, payload.game_id],
    )
    .map_err(|e| format!("could_not_remove_game_from_collection: {e}"))?;
  Ok(())
}

#[tauri::command]
fn list_collection_games(app: AppHandle, payload: CollectionIdPayload) -> Result<Vec<GameDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare(
      "SELECT g.id, g.title, g.install_path, g.is_favorite, g.created_at \
       FROM games g \
       INNER JOIN collection_games cg ON g.id = cg.game_id \
       WHERE cg.collection_id = ?1 ORDER BY g.id DESC",
    )
    .map_err(|e| format!("could_not_prepare_list_collection_games: {e}"))?;
  let result = stmt
    .query_map(params![payload.id], |row| {
      Ok(GameDto {
        id: row.get(0)?,
        title: row.get(1)?,
        install_path: row.get(2)?,
        is_favorite: row.get::<_, i64>(3)? == 1,
        new_download_options_count: 0,
        created_at: row.get(4)?,
      })
    })
    .map_err(|e| format!("could_not_query_collection_games: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_collection_games: {e}"));
  result
}

fn fetch_collection_by_id(conn: &Connection, id: i64) -> Result<CollectionDto, String> {
  conn
    .query_row(
      "SELECT c.id, c.name, COUNT(cg.game_id) as game_count, c.created_at \
       FROM collections c LEFT JOIN collection_games cg ON c.id = cg.collection_id \
       WHERE c.id = ?1 GROUP BY c.id",
      params![id],
      |row| {
        Ok(CollectionDto {
          id: row.get(0)?,
          name: row.get(1)?,
          game_count: row.get(2)?,
          created_at: row.get(3)?,
        })
      },
    )
    .map_err(|e| format!("could_not_fetch_collection: {e}"))
}

// ── Extraction ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtractStatusEvent {
  job_id: String,
  status: String,
  message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SidecarJobWatcher {
  id: String,
  title: String,
  #[serde(default, alias = "destPath")]
  dest_path: String,
  status: String,
}

#[derive(Debug, Deserialize, Clone)]
struct SidecarJobProgressRow {
  id: String,
  status: String,
  #[serde(default)]
  progress: f64,
  #[serde(default, alias = "bytesDownloaded")]
  bytes_downloaded: i64,
  #[serde(default, alias = "totalBytes")]
  total_bytes: i64,
  #[serde(default, alias = "speedBps")]
  speed_bps: i64,
  #[serde(default, alias = "etaSeconds")]
  eta_seconds: i64,
}

fn normalize_sidecar_progress(
  progress: f64,
  bytes_downloaded: i64,
  total_bytes: i64,
  status: &str,
) -> f64 {
  if total_bytes > 0 && bytes_downloaded >= 0 {
    return ((bytes_downloaded as f64 / total_bytes as f64) * 100.0).clamp(0.0, 100.0);
  }

  let mut pct = if progress > 0.0 && progress <= 1.0 {
    progress * 100.0
  } else {
    progress
  };

  let active = matches!(status, "downloading" | "pending" | "retrying" | "paused");

  if bytes_downloaded <= 0 && total_bytes <= 0 && active && pct >= 99.0 {
    return 0.0;
  }

  if bytes_downloaded <= 0 && total_bytes > 0 && active && pct >= 100.0 {
    return 0.0;
  }

  pct.clamp(0.0, 100.0)
}

async fn fetch_sidecar_jobs_progress(app: &AppHandle) -> Result<Vec<SidecarJobProgressRow>, String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let value = client
    .get(format!("http://127.0.0.1:{port}/jobs"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))?;

  let rows = match value {
    serde_json::Value::Array(items) => items,
    serde_json::Value::Object(map) => map
      .get("jobs")
      .or_else(|| map.get("data"))
      .and_then(|v| v.as_array())
      .cloned()
      .unwrap_or_default(),
    _ => Vec::new(),
  };

  Ok(rows
    .into_iter()
    .filter_map(|row| serde_json::from_value::<SidecarJobProgressRow>(row).ok())
    .collect())
}

fn spawn_sidecar_progress_watcher(app: AppHandle) {
  tauri::async_runtime::spawn(async move {
    let mut last_snapshot: HashMap<String, SidecarJobProgressRow> = HashMap::new();
    loop {
      sleep(Duration::from_millis(750)).await;

      let rows = match fetch_sidecar_jobs_progress(&app).await {
        Ok(items) => items,
        Err(_) => continue,
      };

      let active_ids: HashSet<String> = rows.iter().map(|row| row.id.clone()).collect();
      last_snapshot.retain(|id, _| active_ids.contains(id));

      for row in rows {
        let changed = last_snapshot.get(&row.id).map_or(true, |prev| {
          let prev_progress = normalize_sidecar_progress(
            prev.progress,
            prev.bytes_downloaded,
            prev.total_bytes,
            &prev.status,
          );
          let next_progress = normalize_sidecar_progress(
            row.progress,
            row.bytes_downloaded,
            row.total_bytes,
            &row.status,
          );
          prev.status != row.status
            || (prev_progress - next_progress).abs() >= 0.05
            || prev.bytes_downloaded != row.bytes_downloaded
            || prev.total_bytes != row.total_bytes
            || prev.speed_bps != row.speed_bps
        });
        if !changed {
          continue;
        }
        last_snapshot.insert(row.id.clone(), row.clone());

        let progress = normalize_sidecar_progress(
          row.progress,
          row.bytes_downloaded,
          row.total_bytes,
          &row.status,
        );

        let _ = app.emit(
          QUEUE_EVENT_JOB_PROGRESS,
          JobProgressEvent {
            job_id: row.id.clone(),
            progress,
            status: row.status.clone(),
            speed_bytes_per_sec: row.speed_bps.max(0) as u64,
            eta_seconds: row.eta_seconds.max(0),
            bytes_downloaded: Some(row.bytes_downloaded),
            total_bytes: Some(row.total_bytes),
          },
        );

        if let Ok(conn) = open_database_connection(&app) {
          let _ = conn.execute(
            "UPDATE download_jobs SET status = ?1, progress = ?2, bytes_downloaded = ?3, \
             total_bytes = ?4, updated_at = CURRENT_TIMESTAMP WHERE id = ?5",
            params![
              row.status,
              progress.round() as i64,
              row.bytes_downloaded,
              row.total_bytes,
              row.id,
            ],
          );
        }
      }
    }
  });
}

fn emit_extract_status(app: &AppHandle, job_id: &str, status: &str, message: Option<String>) {
  let _ = app.emit(
    EXTRACT_EVENT_STATUS,
    ExtractStatusEvent {
      job_id: job_id.to_string(),
      status: status.to_string(),
      message,
    },
  );
}

// Extração automática desativada na UI; funções mantidas para extract_library_folder / reativação futura.
#[allow(dead_code)]
fn read_app_setting(conn: &Connection, key: &str) -> Option<String> {
  conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = ?1",
      params![key],
      |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
}

fn read_app_setting_bool(conn: &Connection, key: &str, default: bool) -> bool {
  read_app_setting(conn, key)
    .map(|value| !matches!(value.as_str(), "0" | "false" | "FALSE"))
    .unwrap_or(default)
}

#[allow(dead_code)]
fn resolve_7z_path(app: &AppHandle) -> Result<PathBuf, String> {
  let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  let mut candidates: Vec<PathBuf> = vec![
    manifest.join("binaries").join("7za.exe"),
    manifest.join("binaries").join("7z.exe"),
    PathBuf::from(r"C:\Program Files\7-Zip\7z.exe"),
    PathBuf::from(r"C:\Program Files (x86)\7-Zip\7z.exe"),
  ];

  if let Ok(resource_dir) = app.path().resource_dir() {
    candidates.push(resource_dir.join("binaries").join("7za.exe"));
    candidates.push(resource_dir.join("binaries").join("7z.exe"));
    candidates.push(resource_dir.join("7za.exe"));
    candidates.push(resource_dir.join("7z.exe"));
  }

  if let Ok(cwd) = std::env::current_dir() {
    candidates.push(cwd.join("binaries").join("7za.exe"));
    candidates.push(cwd.join("binaries").join("7z.exe"));
    candidates.push(cwd.join("src-tauri").join("binaries").join("7za.exe"));
    candidates.push(cwd.join("src-tauri").join("binaries").join("7z.exe"));
  }

  if let Some(found) = candidates.into_iter().find(|p| p.exists()) {
    return Ok(found);
  }

  if which_7z_on_path().is_some() {
    return Ok(PathBuf::from("7z"));
  }

  Err(
    "7z_not_found: execute npm run setup:binaries ou coloque 7za.exe em src-tauri/binaries/"
      .to_string(),
  )
}

#[cfg(target_os = "windows")]
#[allow(dead_code)]
fn which_7z_on_path() -> Option<PathBuf> {
  StdCommand::new("where")
    .arg("7z")
    .output()
    .ok()
    .filter(|o| o.status.success())
    .and_then(|o| {
      String::from_utf8(o.stdout)
        .ok()
        .and_then(|s| s.lines().next().map(|l| PathBuf::from(l.trim())))
    })
}

#[cfg(not(target_os = "windows"))]
#[allow(dead_code)]
fn which_7z_on_path() -> Option<PathBuf> {
  StdCommand::new("which")
    .arg("7z")
    .output()
    .ok()
    .filter(|o| o.status.success())
    .and_then(|o| {
      String::from_utf8(o.stdout)
        .ok()
        .map(|s| PathBuf::from(s.trim()))
    })
}

fn upsert_extraction_log(
  conn: &Connection,
  job_id: &str,
  status: &str,
  archive_path: Option<&str>,
  extract_path: Option<&str>,
  error: Option<&str>,
) -> Result<(), String> {
  conn
    .execute(
      "INSERT INTO extraction_log (job_id, status, archive_path, extract_path, error, updated_at) \
       VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP) \
       ON CONFLICT(job_id) DO UPDATE SET \
         status = excluded.status, \
         archive_path = excluded.archive_path, \
         extract_path = excluded.extract_path, \
         error = excluded.error, \
         updated_at = CURRENT_TIMESTAMP",
      params![job_id, status, archive_path, extract_path, error],
    )
    .map_err(|e| format!("could_not_upsert_extraction_log: {e}"))?;
  Ok(())
}

fn get_extraction_status(conn: &Connection, job_id: &str) -> Option<String> {
  conn
    .query_row(
      "SELECT status FROM extraction_log WHERE job_id = ?1",
      params![job_id],
      |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
}

fn get_extraction_extract_path(conn: &Connection, job_id: &str) -> Option<PathBuf> {
  conn
    .query_row(
      "SELECT extract_path FROM extraction_log WHERE job_id = ?1",
      params![job_id],
      |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .ok()
    .flatten()
    .flatten()
    .map(PathBuf::from)
    .filter(|path| path.exists())
}

fn library_entry_key(dest_path: &str, title: &str) -> String {
  let mut hasher = DefaultHasher::new();
  dest_path.trim().to_lowercase().hash(&mut hasher);
  normalize_title_key(title).hash(&mut hasher);
  format!("{:016x}", hasher.finish())
}

fn read_library_game_root(conn: &Connection, dest_path: &str, title: &str) -> Option<PathBuf> {
  let key = library_entry_key(dest_path, title);
  conn
    .query_row(
      "SELECT game_root FROM library_game_roots WHERE library_key = ?1",
      params![key],
      |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
    .map(PathBuf::from)
    .filter(|path| path.is_dir())
}

fn upsert_library_game_root(
  conn: &Connection,
  dest_path: &str,
  title: &str,
  game_root: &Path,
) -> Result<(), String> {
  let key = library_entry_key(dest_path, title);
  conn
    .execute(
      "INSERT INTO library_game_roots (library_key, title, dest_path, game_root, updated_at) \
       VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP) \
       ON CONFLICT(library_key) DO UPDATE SET \
         title = excluded.title, \
         dest_path = excluded.dest_path, \
         game_root = excluded.game_root, \
         updated_at = CURRENT_TIMESTAMP",
      params![
        key,
        title,
        dest_path.trim(),
        game_root.to_string_lossy().to_string()
      ],
    )
    .map_err(|error| format!("could_not_save_library_game_root: {error}"))?;
  Ok(())
}

fn stored_game_roots_for(app: &AppHandle, title: &str, dest_path: &str) -> Vec<PathBuf> {
  let Ok(conn) = open_database_connection(app) else {
    return Vec::new();
  };
  read_library_game_root(&conn, dest_path, title)
    .map(|path| vec![path])
    .unwrap_or_default()
}

fn launch_extra_roots(
  app: &AppHandle,
  title: &str,
  dest_path: &str,
  job_id: Option<&str>,
) -> Vec<PathBuf> {
  let mut roots = job_id
    .map(|id| extraction_roots_for_job(app, id))
    .unwrap_or_default();
  for root in stored_game_roots_for(app, title, dest_path) {
    if !roots.iter().any(|existing| existing == &root) {
      roots.push(root);
    }
  }
  roots
}

fn extraction_roots_for_job(app: &AppHandle, job_id: &str) -> Vec<PathBuf> {
  let Ok(conn) = open_database_connection(app) else {
    return Vec::new();
  };
  get_extraction_extract_path(&conn, job_id)
    .map(|path| vec![path])
    .unwrap_or_default()
}

fn apply_extraction_overlay(job: &mut serde_json::Map<String, serde_json::Value>, conn: &Connection) {
  let Some(id) = job
    .get("id")
    .and_then(|value| value.as_str().map(str::to_string))
  else {
    return;
  };

  let Ok(row) = conn.query_row(
    "SELECT status, extract_path, error FROM extraction_log WHERE job_id = ?1",
    params![id],
    |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, Option<String>>(1)?,
        row.get::<_, Option<String>>(2)?,
      ))
    },
  ) else {
    return;
  };

  let (status, extract_path, error) = row;
  if matches!(status.as_str(), "extracting" | "extracted" | "failed") {
    job.insert("status".to_string(), serde_json::Value::String(status));
  }
  if let Some(path) = extract_path {
    job.insert(
      "extractPath".to_string(),
      serde_json::Value::String(path),
    );
  }
  if let Some(message) = error {
    job.insert(
      "errorMsg".to_string(),
      serde_json::Value::String(message),
    );
  }
}

fn enrich_jobs_with_extraction(
  value: &mut serde_json::Value,
  conn: &Connection,
) {
  match value {
    serde_json::Value::Array(items) => {
      for item in items {
        if let serde_json::Value::Object(map) = item {
          apply_extraction_overlay(map, conn);
        }
      }
    }
    serde_json::Value::Object(map) => {
      for key in ["jobs", "data", "items"] {
        if let Some(serde_json::Value::Array(items)) = map.get_mut(key) {
          for item in items {
            if let serde_json::Value::Object(job) = item {
              apply_extraction_overlay(job, conn);
            }
          }
          return;
        }
      }
    }
    _ => {}
  }
}

#[allow(dead_code)]
fn run_7z_extract(seven_zip: &Path, archive: &Path, dest: &Path) -> Result<(), String> {
  std::fs::create_dir_all(dest)
    .map_err(|e| format!("could_not_create_extract_dir: {e}"))?;

  let dest_arg = format!("-o{}", dest.display());
  let mut command = StdCommand::new(seven_zip);
  if let Some(parent) = seven_zip.parent() {
    if !parent.as_os_str().is_empty() {
      command.current_dir(parent);
    }
  }

  let output = command
    .arg("x")
    .arg("-y")
    .arg(&dest_arg)
    .arg(archive)
    .output()
    .map_err(|e| format!("could_not_run_7z: {e}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    return Err(format!(
      "7z_extract_failed: status={} stderr={} stdout={}",
      output.status, stderr, stdout
    ));
  }
  Ok(())
}

#[allow(dead_code)]
fn run_after_install_action(
  app: &AppHandle,
  title: &str,
  dest_path: &str,
  extract_dest: &Path,
) {
  let conn = match open_database_connection(app) {
    Ok(c) => c,
    Err(_) => return,
  };
  let action = read_app_setting(&conn, "after_install_action")
    .unwrap_or_else(|| "ask".to_string());
  drop(conn);

  match action.as_str() {
    "open-folder" => {
      if let Err(error) = open_path_in_shell(extract_dest) {
        log::warn!("after_install_open_folder_failed: {error}");
      }
    }
    "launch-game" => {
      if let Err(error) = launch::resolve_and_launch_game(title, dest_path) {
        log::warn!("after_install_launch_failed: {error}");
      }
    }
    _ => {}
  }
}

fn finalize_job_if_playable(
  app: &AppHandle,
  job_id: &str,
  title: &str,
  dest_path: &str,
) -> Result<bool, String> {
  let candidates = match launch::resolve_launch_candidates(title, dest_path) {
    Ok(items) => items,
    Err(_) => return Ok(false),
  };
  let extract_path = candidates
    .first()
    .and_then(|path| path.parent())
    .map(|path| path.to_string_lossy().to_string());

  let conn = open_database_connection(app)?;
  upsert_extraction_log(
    &conn,
    job_id,
    "extracted",
    None,
    extract_path.as_deref(),
    None,
  )?;
  emit_extract_status(
    app,
    job_id,
    "extracted",
    Some("Executável encontrado na pasta — extração não necessária".to_string()),
  );
  Ok(true)
}

async fn process_job_post_download(
  app: AppHandle,
  job_id: String,
  title: String,
  dest_path: String,
) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  let prior = get_extraction_status(&conn, &job_id);
  if matches!(
    prior.as_deref(),
    Some("extracting") | Some("extracted") | Some("skipped") | Some("failed")
  ) {
    return Ok(());
  }
  drop(conn);

  if finalize_job_if_playable(&app, &job_id, &title, &dest_path)? {
    return Ok(());
  }

  let mark_skipped = |app: &AppHandle, message: &str| -> Result<(), String> {
    let conn = open_database_connection(app)?;
    upsert_extraction_log(&conn, &job_id, "skipped", None, None, None)?;
    emit_extract_status(app, &job_id, "skipped", Some(message.to_string()));
    Ok(())
  };

  if launch::find_setup_executable(&title, &dest_path).is_some() {
    return mark_skipped(&app, "Download concluído — clique em INSTALAR para executar o setup.exe.");
  }

  mark_skipped(
    &app,
    "Download concluído. Clique em INSTALAR se houver setup.exe na pasta.",
  )
}

#[allow(dead_code)]
async fn process_job_extraction(
  app: AppHandle,
  job_id: String,
  title: String,
  dest_path: String,
) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  let install_org = read_app_setting(&conn, "install_organization")
    .unwrap_or_else(|| "separate-folder".to_string());
  let remove_temp = read_app_setting_bool(&conn, "remove_temp_files", true);
  drop(conn);

  let archive = match archive::find_job_archive(&dest_path) {
    Some(path) => path,
    None => {
      return Err(
        "no_archive_found: nenhum arquivo compactado (.zip, .7z, .rar) encontrado na pasta do download"
          .to_string(),
      );
    }
  };

  let base_dir = resolve_job_folder(&dest_path);
  let extract_dest = archive::resolve_extract_destination(&title, &base_dir, &install_org);

  upsert_extraction_log(
    &open_database_connection(&app)?,
    &job_id,
    "extracting",
    Some(&archive.to_string_lossy()),
    Some(&extract_dest.to_string_lossy()),
    None,
  )?;
  emit_extract_status(&app, &job_id, "extracting", None);

  let seven_zip = resolve_7z_path(&app)?;
  run_7z_extract(&seven_zip, &archive, &extract_dest)?;

  if remove_temp && archive.exists() {
    if let Err(error) = std::fs::remove_file(&archive) {
      log::warn!("could_not_remove_archive_after_extract: {error}");
    }
  }

  upsert_extraction_log(
    &open_database_connection(&app)?,
    &job_id,
    "extracted",
    Some(&archive.to_string_lossy()),
    Some(&extract_dest.to_string_lossy()),
    None,
  )?;
  emit_extract_status(&app, &job_id, "extracted", None);
  run_after_install_action(&app, &title, &dest_path, &extract_dest);
  Ok(())
}

#[tauri::command]
async fn extract_job_archive(app: AppHandle, id: String) -> Result<(), String> {
  let job = fetch_sidecar_job(&app, &id).await?;
  let extraction = app.state::<ExtractionState>();
  if !extraction.try_acquire() {
    return Err("extraction_busy".to_string());
  }

  let app_clone = app.clone();
  let job_id = job.id.clone();
  let title = job.title.clone();
  let dest_path = job.dest_path.clone();

  let result = process_job_post_download(app_clone.clone(), job_id, title, dest_path).await;
  extraction.release();

  if let Err(ref error) = result {
    let _ = upsert_extraction_log(
      &open_database_connection(&app_clone)?,
      &id,
      "failed",
      None,
      None,
      Some(error),
    );
    emit_extract_status(&app_clone, &id, "failed", Some(error.clone()));
  }
  result
}

async fn list_sidecar_jobs_for_watcher(app: &AppHandle) -> Result<Vec<SidecarJobWatcher>, String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let value = client
    .get(format!("http://127.0.0.1:{port}/jobs"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))?;

  let rows = match value {
    serde_json::Value::Array(items) => items,
    serde_json::Value::Object(map) => map
      .get("jobs")
      .or_else(|| map.get("data"))
      .and_then(|v| v.as_array())
      .cloned()
      .unwrap_or_default(),
    _ => Vec::new(),
  };

  Ok(rows
    .into_iter()
    .filter_map(|row| serde_json::from_value::<SidecarJobWatcher>(row).ok())
    .collect())
}

fn job_ready_for_post_download(job: &SidecarJobWatcher) -> bool {
  if job.status == "completed" {
    return true;
  }
  if job.status == "seeding" {
    if archive::find_job_archive(&job.dest_path).is_some() {
      return true;
    }
    return launch::job_has_playable_executable(&job.title, &job.dest_path);
  }
  false
}

fn spawn_extraction_watcher(app: AppHandle) {
  tauri::async_runtime::spawn(async move {
    loop {
      sleep(Duration::from_secs(2)).await;

      let jobs = match list_sidecar_jobs_for_watcher(&app).await {
        Ok(items) => items,
        Err(_) => continue,
      };

      let conn = match open_database_connection(&app) {
        Ok(c) => c,
        Err(_) => continue,
      };

      let extraction: tauri::State<'_, ExtractionState> = app.state();
      if !extraction.try_acquire() {
        continue;
      }

      let mut started = false;
      for job in jobs {
        if !job_ready_for_post_download(&job) {
          continue;
        }
        let prior = get_extraction_status(&conn, &job.id);
        if matches!(
          prior.as_deref(),
          Some("extracting") | Some("extracted") | Some("skipped") | Some("failed")
        ) {
          continue;
        }

        let app_clone = app.clone();
        let job_id = job.id.clone();
        let title = job.title.clone();
        let dest_path = job.dest_path.clone();

        tauri::async_runtime::spawn(async move {
          if let Err(error) = process_job_post_download(
            app_clone.clone(),
            job_id.clone(),
            title,
            dest_path,
          )
          .await
          {
            if let Ok(conn) = open_database_connection(&app_clone) {
              let _ = upsert_extraction_log(
                &conn,
                &job_id,
                "failed",
                None,
                None,
                Some(&error),
              );
            }
            emit_extract_status(&app_clone, &job_id, "failed", Some(error));
          }
          let extraction: tauri::State<'_, ExtractionState> = app_clone.state();
          extraction.release();
        });
        started = true;
        break;
      }

      if !started {
        extraction.release();
      }
    }
  });
}

// ── App Entry Point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(QueueManager::new())
    .manage(SidecarState::default())
    .manage(ExtractionState::default())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      app.handle().plugin(tauri_plugin_notification::init())?;
      app.handle().plugin(tauri_plugin_dialog::init())?;
      let _ = open_database_connection(app.handle());
      startup_queue_recovery(app.handle());
      spawn_download_engine(app.handle().clone());
      spawn_sidecar_progress_watcher(app.handle().clone());
      spawn_extraction_watcher(app.handle().clone());

      let show_item = MenuItem::with_id(app, "tray_show", "Mostrar janela", true, None::<&str>)?;
      let hide_item = MenuItem::with_id(app, "tray_hide", "Ocultar janela", true, None::<&str>)?;
      let quit_item = MenuItem::with_id(app, "tray_quit", "Sair", true, None::<&str>)?;
      let tray_menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

      let app_handle = app.handle().clone();
      let _tray = TrayIconBuilder::new()
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
          "tray_show" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
          "tray_hide" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.hide();
            }
          }
          "tray_quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(move |_tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            if let Some(window) = app_handle.get_webview_window("main") {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
        })
        .build(app)?;
      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { .. } = event {
        let app_handle = window.app_handle().clone();
        tauri::async_runtime::spawn(async move {
          if let Err(error) = pause_all_active_sidecar_jobs(app_handle).await {
            log::warn!("could_not_pause_jobs_on_close: {error}");
          }
        });
      }
    })
    .invoke_handler(tauri::generate_handler![
      ping,
      app_version,
      get_paths,
      add_source,
      add_download_source,
      list_sources,
      get_download_sources,
      remove_download_source,
      search_download_options,
      search_game_catalog,
      set_default_download_path,
      get_default_download_path,
      set_seed_torrents_enabled,
      get_seed_torrents_enabled,
      get_app_setting,
      set_app_setting,
      get_disk_free_bytes_for_path,
      scan_default_download_path,
      delete_local_library_item,
      remove_source,
      test_download_source,
      get_download_sources_changes,
      sync_download_sources,
      check_download_sources_changes,
      search_game_download_options,
      start_mock_download,
      add_game,
      list_games,
      update_game,
      remove_game,
      toggle_game_favorite,
      enqueue_job,
      list_jobs,
      cancel_job,
      pause_job,
      resume_job,
      clear_completed_jobs,
      create_collection,
      list_collections,
      delete_collection,
      add_game_to_collection,
      remove_game_from_collection,
      list_collection_games,
      sidecar_enqueue_job,
      sidecar_list_jobs,
      sidecar_pause_job,
      sidecar_resume_job,
      sidecar_cancel_job,
      remove_job_from_library,
      sidecar_open_job_folder,
      sidecar_launch_job,
      sidecar_status,
      launch_game_from_path,
      extract_job_archive,
      open_local_path,
      open_deep_link,
      list_game_covers,
      ensure_game_cover_cached,
      save_game_cover,
      resolve_game_cover_url,
      invalidate_game_cover_local,
      check_path_playable,
      inspect_library_path,
      set_library_game_root,
      launch_setup_from_path,
      extract_library_folder
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod search_match_tests {
  use super::{title_matches_query, title_word_matches_query_word};

  #[test]
  fn hades_does_not_match_shades_or_shadespire() {
    assert!(!title_matches_query(
      "OUTBREAK: SHADES OF HORROR - CHROMATIC SPLIT",
      "HADES",
    ));
    assert!(!title_matches_query(
      "WARHAMMER UNDERWORLDS: SHADESPIRE EDITION - V1.8.7 + ALL DLCS",
      "HADES",
    ));
  }

  #[test]
  fn hades_matches_hades_titles() {
    assert!(title_matches_query(
      "HADES - V1.35966 (V1.0) + BONUS SOUNDTRACK",
      "HADES",
    ));
    assert!(title_matches_query("HADES II - V1.137792 + BONUS OST", "HADES"));
  }

  #[test]
  fn substring_hades_inside_shades_is_rejected() {
    assert!(!title_word_matches_query_word("shades", "hades"));
    assert!(!title_word_matches_query_word("shadespire", "hades"));
    assert!(title_word_matches_query_word("hades", "hades"));
  }
}

#[cfg(test)]
mod cover_cache_tests {
  use super::{cover_download_urls, is_valid_cover_bytes, normalize_title_key, upsert_game_cover};
  use rusqlite::{params, Connection};

  fn test_conn() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        "CREATE TABLE game_covers (
          title_key TEXT PRIMARY KEY,
          cover_url TEXT NOT NULL,
          local_path TEXT,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );",
      )
      .unwrap();
    conn
  }

  #[test]
  fn upsert_invalidates_local_path_when_cover_url_changes() {
    let conn = test_conn();
    let title = "Mega Man X Legacy Collection";
    let key = normalize_title_key(title);

    conn.execute(
      "INSERT INTO game_covers (title_key, cover_url, local_path) VALUES (?1, ?2, ?3)",
      params![key, "https://example.com/old.jpg", "C:\\covers\\old.jpg"],
    )
    .unwrap();

    let stale = upsert_game_cover(&conn, title, "https://example.com/new.jpg").unwrap();
    assert_eq!(stale.as_deref(), Some("C:\\covers\\old.jpg"));

    let (url, local): (String, Option<String>) = conn
      .query_row(
        "SELECT cover_url, local_path FROM game_covers WHERE title_key = ?1",
        params![key],
        |row| Ok((row.get(0)?, row.get(1)?)),
      )
      .unwrap();
    assert_eq!(url, "https://example.com/new.jpg");
    assert!(local.is_none());
  }

  #[test]
  fn upsert_keeps_local_path_when_cover_url_unchanged() {
    let conn = test_conn();
    let title = "Stardew Valley";
    let key = normalize_title_key(title);
    let url = "https://cdn.example.com/stardew.jpg";

    conn.execute(
      "INSERT INTO game_covers (title_key, cover_url, local_path) VALUES (?1, ?2, ?3)",
      params![key, url, "C:\\covers\\stardew.jpg"],
    )
    .unwrap();

    let stale = upsert_game_cover(&conn, title, url).unwrap();
    assert!(stale.is_none());

    let local: Option<String> = conn
      .query_row(
        "SELECT local_path FROM game_covers WHERE title_key = ?1",
        params![key],
        |row| row.get(0),
      )
      .unwrap();
    assert_eq!(local.as_deref(), Some("C:\\covers\\stardew.jpg"));
  }

  #[test]
  fn rejects_html_and_tiny_payloads_as_covers() {
    assert!(!is_valid_cover_bytes(b"<html>404 not found</html>"));
    assert!(!is_valid_cover_bytes(&[0xFF; 128]));
  }

  #[test]
  fn accepts_jpeg_png_and_webp_magic_bytes() {
    let mut jpeg = vec![0xFF, 0xD8, 0xFF, 0xE0];
    jpeg.resize(300, 0);
    assert!(is_valid_cover_bytes(&jpeg));

    let mut png = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    png.resize(300, 0);
    assert!(is_valid_cover_bytes(&png));

    let mut webp = b"RIFF".to_vec();
    webp.extend_from_slice(&[0, 0, 0, 0]);
    webp.extend_from_slice(b"WEBP");
    webp.resize(300, 0);
    assert!(is_valid_cover_bytes(&webp));
  }

  #[test]
  fn cover_download_urls_includes_steam_variants() {
    let urls = cover_download_urls(
      "https://cdn.cloudflare.steamstatic.com/steam/apps/570/header.jpg",
    );
    assert!(urls.iter().any(|u| u.contains("library_600x900.jpg")));
    assert!(urls.iter().any(|u| u.contains("header.jpg")));
    assert!(urls.len() >= 3);
  }
}
