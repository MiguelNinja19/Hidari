mod cover;
mod persist;
mod settings;

use super::super::engine::ensure_sidecar_running;
use crate::db::open_database_connection;
use crate::dto::SidecarEnqueuePayload;
use crate::sources::{enrich_magnet_url_with_title, validate_job_url};
use tauri::AppHandle;

use cover::spawn_cover_download_if_needed;
use persist::persist_enqueued_job;
use settings::load_enqueue_settings;

#[tauri::command]
pub async fn sidecar_enqueue_job(
  app: AppHandle,
  payload: SidecarEnqueuePayload,
) -> Result<serde_json::Value, String> {
  validate_job_url(&payload.url)?;
  let port = ensure_sidecar_running(app.clone()).await?;
  let conn = open_database_connection(&app)?;
  let settings = load_enqueue_settings(&conn, &payload)?;
  drop(conn);
  let dest_path = crate::path_security::validate_enqueue_dest_path(&app, &settings.dest_path)?;
  let job_url = enrich_magnet_url_with_title(&payload.url, Some(&payload.title));

  let body = {
    let mut b = serde_json::json!({
      "title": payload.title,
      "url": job_url,
      "destPath": dest_path,
      "priority": payload.priority,
      "seedEnabled": settings.seed_enabled
    });
    if let Some(bps) = settings.max_speed_bps {
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

  persist_enqueued_job(&app, &job, &payload, &job_url, &dest_path);
  spawn_cover_download_if_needed(&app, &payload);

  Ok(job)
}
