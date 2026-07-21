use crate::db::open_database_connection;
use crate::queue::persist::{
  is_fully_transferred_bytes, update_persisted_queue_progress,
};
use rusqlite::params;
use tauri::AppHandle;

pub(crate) fn persist_progress_batch(
  app: &AppHandle,
  batch_updates: Vec<(String, i64, i64, i64, Option<String>, String)>,
) {
  if batch_updates.is_empty() {
    return;
  }
  if let Ok(conn) = open_database_connection(app) {
    let _ = conn.execute("BEGIN IMMEDIATE", []);
    for (status, progress, bytes, total, error_msg, id) in batch_updates {
      let _ = conn.execute(
        "UPDATE download_jobs SET status = ?1, progress = ?2, bytes_downloaded = ?3, \
         total_bytes = ?4, error_msg = COALESCE(?5, error_msg), \
         updated_at = CURRENT_TIMESTAMP WHERE id = ?6",
        params![status, progress, bytes, total, error_msg, id.parse::<i64>().unwrap_or(0)],
      );
      let persist_status = if is_fully_transferred_bytes(bytes, total) && status == "seeding" {
        "completed".to_string()
      } else {
        status
      };
      let _ = update_persisted_queue_progress(
        &conn,
        &id,
        &persist_status,
        progress,
        bytes,
        total,
        error_msg.as_deref(),
      );
    }
    let _ = conn.execute("COMMIT", []);
  }
}
