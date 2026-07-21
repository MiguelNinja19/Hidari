use tauri::AppHandle;

use super::super::list::is_resumable_queue_status;
use super::super::transfer::is_fully_transferred_job;
use super::super::types::PersistedQueueJob;
use super::super::write::update_persisted_queue_status;

pub(super) fn should_skip_restore(app: &AppHandle, job: &PersistedQueueJob) -> bool {
  if !is_resumable_queue_status(&job.status) || job.url.trim().is_empty() {
    return true;
  }
  if job.status == "seeding" {
    return false;
  }
  if !is_fully_transferred_job(job.bytes_downloaded, job.total_bytes) {
    return false;
  }
  if let Ok(conn) = crate::db::open_database_connection(app) {
    let _ = update_persisted_queue_status(&conn, &job.id, "completed", None);
  }
  log::info!(
    "skip restore of finished job '{}' ({} / {} bytes)",
    job.title,
    job.bytes_downloaded,
    job.total_bytes
  );
  true
}
