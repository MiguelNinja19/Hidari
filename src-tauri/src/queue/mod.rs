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
    // Nunca limpar seeding — o utilizador precisa de ver quem está a semear.
    if job.status == "seeding" {
      continue;
    }
    let extracted = get_extraction_status(&conn, &job.id);
    // verified = passo intermédio do pós-download — não apagar.
    if matches!(extracted.as_deref(), Some("verified") | Some("extracting")) {
      continue;
    }
    let should_remove = matches!(
      job.status.as_str(),
      "completed" | "cancelled" | "failed" | "skipped" | "extracted"
    ) || matches!(extracted.as_deref(), Some("extracted") | Some("skipped"))
      && matches!(
        job.status.as_str(),
        "completed" | "paused" | "skipped" | "extracted" | "failed" | "cancelled"
      );
    // Job a 100% ainda em downloading/paused (não seeding), já com extract estável.
    let fully_done = {
      let reported = job.total_bytes.max(job.bytes_downloaded);
      reported >= 5 * 1024 * 1024
        && job.total_bytes > 0
        && job.bytes_downloaded >= (job.total_bytes as f64 * 0.995) as i64
    };
    let should_remove = should_remove
      || (fully_done
        && matches!(job.status.as_str(), "downloading" | "pending" | "paused")
        && matches!(extracted.as_deref(), Some("extracted") | Some("skipped")));
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
      "DELETE FROM download_jobs WHERE status IN ('completed', 'cancelled', 'failed', 'skipped', 'extracted')",
      [],
    )
    .map_err(|e| format!("could_not_clear_jobs: {e}"))?;

  Ok(removed)
}

/// Prepara tabelas — a retoma real fica em `restore_persisted_queue_jobs` (auto-resume).
pub fn startup_queue_recovery(app: &AppHandle) {
  if let Ok(conn) = open_database_connection(app) {
    let _ = persist::ensure_persisted_queue_table(&conn);
  }
}
