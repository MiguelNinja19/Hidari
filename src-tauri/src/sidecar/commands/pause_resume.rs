use super::super::engine::ensure_sidecar_running;
use crate::db::open_database_connection;
use crate::queue::persist::update_persisted_queue_status;
use tauri::AppHandle;

#[tauri::command]
pub async fn sidecar_pause_job(app: AppHandle, id: String) -> Result<(), String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let response = client
    .post(format!("http://127.0.0.1:{port}/jobs/{id}/pause"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?;

  if !response.status().is_success() {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    return Err(format!("sidecar_pause_failed: {status} {body}"));
  }
  if let Ok(conn) = open_database_connection(&app) {
    let _ = update_persisted_queue_status(&conn, &id, "paused", None);
  }
  Ok(())
}

#[tauri::command]
pub async fn sidecar_resume_job(app: AppHandle, id: String) -> Result<(), String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let response = client
    .post(format!("http://127.0.0.1:{port}/jobs/{id}/resume"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?;

  if !response.status().is_success() {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    return Err(format!("sidecar_resume_failed: {status} {body}"));
  }
  if let Ok(conn) = open_database_connection(&app) {
    let _ = update_persisted_queue_status(&conn, &id, "pending", None);
  }
  Ok(())
}
