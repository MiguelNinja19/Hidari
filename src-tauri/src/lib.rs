use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
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
}

impl SidecarState {
  fn get_port(&self) -> Option<u16> {
    *self.port.lock().unwrap()
  }

  fn set_port(&self, port: u16) {
    *self.port.lock().unwrap() = Some(port);
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

// ── DTOs: Sources ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct AddSourcePayload {
  name: String,
  base_url: String,
}

#[derive(Debug, Deserialize)]
struct RemoveSourcePayload {
  id: i64,
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
      "SELECT id, title, install_path, is_favorite, created_at FROM games ORDER BY id DESC",
    )
    .map_err(|e| format!("could_not_prepare_list_games: {e}"))?;
  let result = stmt
    .query_map([], |row| {
      Ok(GameDto {
        id: row.get(0)?,
        title: row.get(1)?,
        install_path: row.get(2)?,
        is_favorite: row.get::<_, i64>(3)? == 1,
        created_at: row.get(4)?,
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
  dest_path: String,
  priority: Option<i32>,
}

#[tauri::command]
async fn sidecar_enqueue_job(
  app: AppHandle,
  payload: SidecarEnqueuePayload,
) -> Result<serde_json::Value, String> {
  let port = get_sidecar_port(&app)?;
  let client = reqwest::Client::new();
  client
    .post(format!("http://127.0.0.1:{port}/jobs"))
    .json(&serde_json::json!({
      "title": payload.title,
      "url": payload.url,
      "destPath": payload.dest_path,
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
  let port = get_sidecar_port(&app)?;
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
  let port = get_sidecar_port(&app)?;
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
  let port = get_sidecar_port(&app)?;
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
  let port = get_sidecar_port(&app)?;
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
    Some(port) => serde_json::json!({ "running": true, "port": port }),
    None => serde_json::json!({ "running": false }),
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
    let engine_path = app
      .path()
      .app_data_dir()
      .ok()
      .map(|p| p.parent().unwrap_or(&p).join("download-engine.exe"))
      .unwrap_or_else(|| std::path::PathBuf::from("download-engine.exe"));

    let data_dir = app
      .path()
      .app_data_dir()
      .map(|p| p.to_string_lossy().to_string())
      .unwrap_or_else(|_| ".".to_string());

    let mut child = match tokio::process::Command::new(&engine_path)
      .env("ENGINE_DATA_DIR", &data_dir)
      .stdout(std::process::Stdio::piped())
      .stderr(std::process::Stdio::null())
      .spawn()
    {
      Ok(c) => c,
      Err(e) => {
        log::warn!("download-engine not found at {engine_path:?}: {e}");
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
            log::info!("download-engine ready on port {port}");
            break;
          }
        }
      }
    }

    let _ = child.wait().await;
    log::warn!("download-engine exited");
  });
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
  Ok(())
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
      "SELECT id, title, install_path, is_favorite, created_at FROM games WHERE id = ?1",
      params![id],
      |row| {
        Ok(GameDto {
          id: row.get(0)?,
          title: row.get(1)?,
          install_path: row.get(2)?,
          is_favorite: row.get::<_, i64>(3)? == 1,
          created_at: row.get(4)?,
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
      list_sources,
      remove_source,
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
