use super::engine::{ensure_sidecar_running, fetch_sidecar_job, resolve_job_folder};
use super::extraction::enrich_jobs_with_extraction;
use crate::covers::{download_and_cache_cover, remove_cover_file, upsert_game_cover};
use crate::db::open_database_connection;
use crate::dto::{
  APP_EVENT_DEEP_LINK, DeepLinkEventPayload, SidecarEnqueuePayload,
};
use crate::launch;
use crate::launch_errors;
use crate::library::roots::{launch_extra_roots, open_path_in_shell};
use crate::sources::{enrich_magnet_url, validate_job_url};
use crate::state::SidecarState;
use rusqlite::params;
use std::path::PathBuf;
use std::process::Command as StdCommand;
use tauri::{AppHandle, Emitter, Manager};
use url::Url;

#[tauri::command]
pub async fn sidecar_enqueue_job(
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
pub async fn sidecar_list_jobs(app: AppHandle) -> Result<serde_json::Value, String> {
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
pub async fn sidecar_pause_job(app: AppHandle, id: String) -> Result<(), String> {
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
pub async fn sidecar_resume_job(app: AppHandle, id: String) -> Result<(), String> {
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
pub async fn sidecar_cancel_job(app: AppHandle, id: String) -> Result<(), String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let response = client
    .delete(format!("http://127.0.0.1:{port}/jobs/{id}"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?;

  if !response.status().is_success() {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    return Err(format!("sidecar_cancel_failed: {status} {body}"));
  }

  if let Ok(conn) = open_database_connection(&app) {
    let _ = conn.execute(
      "DELETE FROM extraction_log WHERE job_id = ?1",
      params![id],
    );
    let _ = conn.execute(
      "UPDATE download_jobs SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
      params![id],
    );
  }

  Ok(())
}

#[tauri::command]
pub async fn remove_job_from_library(app: AppHandle, id: String) -> Result<(), String> {
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
pub async fn sidecar_open_job_folder(app: AppHandle, id: String) -> Result<(), String> {
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
#[tauri::command]
pub async fn sidecar_launch_job(app: AppHandle, id: String) -> Result<String, String> {
  let job = fetch_sidecar_job(&app, &id).await?;
  let extra_roots = launch_extra_roots(&app, &job.title, &job.dest_path, Some(&id));
  let launched = launch::resolve_and_launch_game_with_extra_roots(
    &job.title,
    &job.dest_path,
    &extra_roots,
  )
  .map_err(|error| launch_errors::map_launch_user_error(&error, &job.dest_path))?;
  Ok(launched.to_string_lossy().to_string())
}

#[tauri::command]
pub fn sidecar_status(app: AppHandle) -> serde_json::Value {
  let sidecar: tauri::State<'_, SidecarState> = app.state();
  match sidecar.get_port() {
    Some(port) => serde_json::json!({ "running": true, "port": port, "booting": sidecar.is_booting() }),
    None => serde_json::json!({ "running": false, "booting": sidecar.is_booting() }),
  }
}

#[tauri::command]
pub fn open_deep_link(app: AppHandle, url: String) -> Result<(), String> {
  emit_deep_link_event(&app, &url)?;
  Ok(())
}

#[tauri::command]
pub fn open_local_path(path: String) -> Result<(), String> {
  open_path_in_shell(&PathBuf::from(path.trim()))
}

pub fn emit_deep_link_event(app: &AppHandle, url: &str) -> Result<(), String> {
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
