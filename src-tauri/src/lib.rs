use regex::Regex;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::time::{sleep, Duration};
use url::Url;

const DOWNLOAD_EVENT_PROGRESS: &str = "download://progress";
const QUEUE_EVENT_JOB_PROGRESS: &str = "queue://job-progress";
const APP_EVENT_DEEP_LINK: &str = "app://deep-link";

// ── Sidecar State ─────────────────────────────────────────────────────────────

#[derive(Default)]
struct SidecarState {
  port: Mutex<Option<u16>>,
  booting: Mutex<bool>,
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
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchDownloadOptionsPayload {
  query: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetDefaultDownloadPathPayload {
  path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HydraCatalogueSuggestion {
  title: String,
  object_id: String,
  shop: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HydraGameDownloadSourceItem {
  title: String,
  uris: Vec<String>,
  download_source_id: Option<String>,
  download_source_name: Option<String>,
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
  job_id: i64,
  progress: i64,
  status: String,
  speed_bytes_per_sec: u64,
  eta_seconds: i64,
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
  drop(conn);

  if hydra_sources.is_empty() {
    return Ok(Vec::new());
  }

  let local_options = search_download_options_from_local_sources(query, &hydra_sources).await;
  if !local_options.is_empty() {
    return Ok(local_options);
  }

  Ok(Vec::new())
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

  items.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
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
fn clear_completed_jobs(app: AppHandle) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "DELETE FROM download_jobs WHERE status IN ('completed', 'cancelled')",
      [],
    )
    .map_err(|e| format!("could_not_clear_jobs: {e}"))?;
  Ok(())
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
          job_id,
          progress,
          status: "downloading".to_string(),
          speed_bytes_per_sec: 1_200_000,
          eta_seconds: (100 - progress) * 2,
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
        job_id,
        progress: final_progress,
        status: final_status.to_string(),
        speed_bytes_per_sec: 0,
        eta_seconds: 0,
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
  let dest_path = payload
    .dest_path
    .clone()
    .or(default_dest_path)
    .ok_or_else(|| "default_download_path_not_configured".to_string())?;
  drop(conn);

  let client = reqwest::Client::new();
  client
    .post(format!("http://127.0.0.1:{port}/jobs"))
    .json(&serde_json::json!({
      "title": payload.title,
      "url": payload.url,
      "destPath": dest_path,
      "priority": payload.priority
    }))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))
}

#[tauri::command]
async fn sidecar_list_jobs(app: AppHandle) -> Result<serde_json::Value, String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  client
    .get(format!("http://127.0.0.1:{port}/jobs"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))
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
    let mut engine_candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
      engine_candidates.push(cwd.join("..").join("download-engine").join("target8").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("download-engine").join("target8").join("release").join(exe_name));
      engine_candidates.push(cwd.join("..").join("download-engine").join("target7").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("download-engine").join("target7").join("release").join(exe_name));
      engine_candidates.push(cwd.join("..").join("download-engine").join("target6").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("download-engine").join("target6").join("release").join(exe_name));
      engine_candidates.push(cwd.join("..").join("download-engine").join("target5").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("download-engine").join("target5").join("release").join(exe_name));
      engine_candidates.push(cwd.join("..").join("download-engine").join("target4").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("download-engine").join("target4").join("release").join(exe_name));
      engine_candidates.push(cwd.join("..").join("download-engine").join("target3").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("download-engine").join("target3").join("release").join(exe_name));
      engine_candidates.push(cwd.join("..").join("download-engine").join("target2").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("download-engine").join("target2").join("release").join(exe_name));
      engine_candidates.push(cwd.join("..").join("download-engine").join("target").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("download-engine").join("target").join("release").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target8").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target8").join("release").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target7").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target7").join("release").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target6").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target6").join("release").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target5").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target5").join("release").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target4").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target4").join("release").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target3").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target3").join("release").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target2").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target2").join("release").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target").join("debug").join(exe_name));
      engine_candidates.push(cwd.join("..").join("..").join("download-engine").join("target").join("release").join(exe_name));
      engine_candidates.push(cwd.join(exe_name));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
      engine_candidates.push(resource_dir.join(exe_name));
      engine_candidates.push(resource_dir.join("binaries").join(exe_name));
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

  let sidecar: tauri::State<'_, SidecarState> = app.state();
  if !sidecar.is_booting() {
    drop(sidecar);
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
      });
    }
  }

  options
}

async fn hydra_search_download_options(
  query: &str,
  source_ids: &[String],
) -> Result<Vec<DownloadOptionDto>, String> {
  let client = hydra_http_client()?;
  let suggestions = client
    .get(format!("{}/catalogue/search/suggestions", hydra_api_base_url()))
    .query(&[("query", query), ("limit", "8")])
    .send()
    .await
    .map_err(|error| format!("hydra_suggestions_request_failed: {error}"))?;

  if !suggestions.status().is_success() {
    let status = suggestions.status().as_u16();
    let body = suggestions.text().await.unwrap_or_default();
    return Err(format!("hydra_suggestions_failed_http_{status}: {body}"));
  }

  let suggestions = suggestions
    .json::<Vec<HydraCatalogueSuggestion>>()
    .await
    .map_err(|error| format!("hydra_suggestions_parse_failed: {error}"))?;

  let mut options: Vec<DownloadOptionDto> = Vec::new();
  let source_ids_csv = source_ids.join(",");
  for game in suggestions {
    let response = client
      .get(format!(
        "{}/games/{}/{}/download-sources",
        hydra_api_base_url(),
        game.shop,
        game.object_id
      ))
      .query(&[
        ("take", "30"),
        ("skip", "0"),
        ("downloadSourceIds", source_ids_csv.as_str()),
      ])
      .send()
      .await
      .map_err(|error| format!("hydra_download_sources_request_failed: {error}"))?;

    if !response.status().is_success() {
      continue;
    }

    let repacks = match response.json::<Vec<HydraGameDownloadSourceItem>>().await {
      Ok(items) => items,
      Err(_) => continue,
    };

    for repack in repacks {
      let source_id = repack
        .download_source_id
        .clone()
        .unwrap_or_else(|| "hydra".to_string());
      let source_name = repack
        .download_source_name
        .clone()
        .unwrap_or_else(|| "Hydra".to_string());
      for uri in repack.uris {
        let download_type = if uri.starts_with("magnet:") {
          "torrent".to_string()
        } else {
          "http".to_string()
        };
        options.push(DownloadOptionDto {
          source_id: source_id.clone(),
          source_name: source_name.clone(),
          title: format!("{} - {}", game.title, repack.title),
          download_type,
          url: uri,
          quality: "standard".to_string(),
        });
      }
    }
  }

  Ok(options)
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
  let normalized_query = query.trim().to_lowercase();
  let base = fitgirl_base_url(source);
  let search_response = client.get(format!("{base}/")).query(&[("s", query)]).send().await;
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

  let post_links = extract_fitgirl_post_links(&search_html);
  if post_links.is_empty() {
    return Vec::new();
  }

  let mut options: Vec<DownloadOptionDto> = Vec::new();
  for post_url in post_links.into_iter().take(5) {
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

    let title = extract_fitgirl_title(&post_html).unwrap_or_else(|| query.to_string());
    if !title.to_lowercase().contains(&normalized_query) {
      continue;
    }
    let magnets = extract_magnet_links(&post_html);
    if magnets.is_empty() {
      options.push(DownloadOptionDto {
        source_id: source.id.clone(),
        source_name: source.name.clone(),
        title: format!("{title} (pagina da fonte)"),
        download_type: "http".to_string(),
        url: post_url.clone(),
        quality: "standard".to_string(),
      });
      continue;
    }

    for magnet in magnets.into_iter().take(2) {
      options.push(DownloadOptionDto {
        source_id: source.id.clone(),
        source_name: source.name.clone(),
        title: title.clone(),
        download_type: "torrent".to_string(),
        url: magnet,
        quality: "standard".to_string(),
      });
    }
  }

  options
}

fn extract_fitgirl_post_links(html: &str) -> Vec<String> {
  let title_link_re = Regex::new(
    r#"<h[12][^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*<a[^>]*href="(https?://fitgirl-repacks\.site/[^"]+)""#,
  )
  .expect("fitgirl title link regex must compile");
  let mut links: Vec<String> = Vec::new();
  for captures in title_link_re.captures_iter(html) {
    let Some(url_match) = captures.get(1) else {
      continue;
    };
    let url = url_match.as_str().to_string();
    if url.contains("/wp-content/")
      || url.contains("/feed/")
      || url.contains("/search/")
      || url.contains("/tag/")
      || url.contains("/category/")
      || url.ends_with(".js")
      || url.ends_with(".css")
    {
      continue;
    }
    if !links.contains(&url) {
      links.push(url);
    }
  }
  links
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

fn hydra_api_base_url() -> String {
  std::env::var("HYDRA_API_URL").unwrap_or_else(|_| "https://api.hydralauncher.gg".to_string())
}

fn hydra_http_client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .timeout(Duration::from_secs(20))
    .build()
    .map_err(|error| format!("could_not_create_hydra_client: {error}"))
}

async fn hydra_post_download_source(url: &str) -> Result<HydraSourceDto, String> {
  let client = hydra_http_client()?;
  let response = client
    .post(format!("{}/download-sources", hydra_api_base_url()))
    .json(&serde_json::json!({ "url": url }))
    .send()
    .await
    .map_err(|error| format!("hydra_add_source_request_failed: {error}"))?;

  if !response.status().is_success() {
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    return Err(format!("hydra_add_source_failed_http_{status}: {body}"));
  }

  response
    .json::<HydraSourceDto>()
    .await
    .map_err(|error| format!("hydra_add_source_parse_failed: {error}"))
}

async fn hydra_sync_download_sources(ids: Vec<String>) -> Result<Vec<HydraSourceDto>, String> {
  let client = hydra_http_client()?;
  let response = client
    .post(format!("{}/download-sources/sync", hydra_api_base_url()))
    .json(&serde_json::json!({ "ids": ids }))
    .send()
    .await
    .map_err(|error| format!("hydra_sync_sources_request_failed: {error}"))?;

  if !response.status().is_success() {
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    return Err(format!("hydra_sync_sources_failed_http_{status}: {body}"));
  }

  response
    .json::<Vec<HydraSourceDto>>()
    .await
    .map_err(|error| format!("hydra_sync_sources_parse_failed: {error}"))
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
  Ok(conn)
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
      ",
    )
    .map_err(|e| format!("could_not_initialize_database: {e}"))
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
      |row| map_job_row(row),
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

// ── App Entry Point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(QueueManager::new())
    .manage(SidecarState::default())
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
      let _ = open_database_connection(&app.handle());
      startup_queue_recovery(&app.handle());
      spawn_download_engine(app.handle().clone());

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
      set_default_download_path,
      get_default_download_path,
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
      sidecar_status,
      open_deep_link
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
