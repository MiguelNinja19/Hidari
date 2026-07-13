pub mod persist;

use crate::db::{get_extraction_status, open_database_connection};
use crate::dto::SidecarJobWatcher;
use crate::queue::persist::delete_persisted_queue_job;
use crate::sidecar::ensure_sidecar_running;
use rusqlite::params;
use tauri::AppHandle;

#[tauri::command]
pub async fn clear_completed_jobs(app: AppHandle) -> Result<Vec<String>, String> {
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
    let _ = delete_persisted_queue_job(&conn, &job.id);
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

/// Legacy table cosmetic reset — real recovery is `restore_persisted_queue_jobs`.
pub fn startup_queue_recovery(app: &AppHandle) {
  if let Ok(conn) = open_database_connection(app) {
    let _ = conn.execute(
      "UPDATE download_jobs SET status = 'pending', updated_at = CURRENT_TIMESTAMP \
       WHERE status = 'downloading'",
      [],
    );
    let _ = persist::ensure_persisted_queue_table(&conn);
    let _ = persist::mark_active_persisted_jobs_paused(&conn);
  }
}
