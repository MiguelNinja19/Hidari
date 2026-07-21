use super::super::engine::{ensure_sidecar_running, fetch_sidecar_job};
use crate::db::open_database_connection;
use crate::library::cleanup_torrent_sidecar_files;
use crate::queue::persist::update_persisted_queue_status;
use rusqlite::params;
use tauri::AppHandle;

#[tauri::command]
pub async fn sidecar_cancel_job(app: AppHandle, id: String) -> Result<(), String> {
  let job_snapshot = fetch_sidecar_job(&app, &id).await.ok();
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let response = client
    .post(format!("http://127.0.0.1:{port}/jobs/{id}/cancel"))
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
      "UPDATE download_jobs SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
      params![id],
    );
    let _ = update_persisted_queue_status(&conn, &id, "cancelled", None);
  }

  if let Some(job) = job_snapshot {
    cleanup_torrent_sidecar_files(&job.dest_path, &job.title);
  }

  Ok(())
}

#[tauri::command]
pub async fn remove_job_from_library(app: AppHandle, id: String) -> Result<(), String> {
  let job_snapshot = fetch_sidecar_job(&app, &id).await.ok();

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
  let _ = crate::queue::persist::delete_persisted_queue_job(&conn, &id);

  if let Some(job) = job_snapshot {
    cleanup_torrent_sidecar_files(&job.dest_path, &job.title);
  }

  Ok(())
}
