use rusqlite::Connection;

use super::schema::ensure_persisted_queue_table;
use super::transfer::{finalize_fully_transferred_persisted_jobs, is_fully_transferred_job};
use super::types::PersistedQueueJob;

pub fn mark_active_persisted_jobs_paused(conn: &Connection) -> Result<(), String> {
  ensure_persisted_queue_table(conn)?;
  // Downloads já a 100%: fecham como completed — senão no próximo arranque
  // o restore recria o magnet e parece “baixar de novo”.
  let _ = finalize_fully_transferred_persisted_jobs(conn);
  conn
    .execute(
      "UPDATE persisted_queue_jobs \
       SET status = 'paused', updated_at = CURRENT_TIMESTAMP \
       WHERE status IN ('downloading', 'pending', 'retrying')",
      [],
    )
    .map_err(|e| format!("could_not_mark_persisted_jobs_paused: {e}"))?;
  Ok(())
}

fn is_resumable_status(status: &str) -> bool {
  matches!(
    status,
    "paused" | "pending" | "downloading" | "retrying" | "seeding"
  )
}

pub fn list_resumable_persisted_jobs(conn: &Connection) -> Result<Vec<PersistedQueueJob>, String> {
  ensure_persisted_queue_table(conn)?;
  let _ = finalize_fully_transferred_persisted_jobs(conn);
  let mut stmt = conn
    .prepare(
      "SELECT id, title, url, dest_path, status, priority, progress, bytes_downloaded, total_bytes, error_msg, source_name \
       FROM persisted_queue_jobs \
       WHERE status IN ('paused', 'pending', 'downloading', 'retrying', 'seeding') \
       ORDER BY updated_at ASC",
    )
    .map_err(|e| format!("could_not_prepare_persisted_queue_list: {e}"))?;

  let rows = stmt
    .query_map([], |row| {
      Ok(PersistedQueueJob {
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
        source_name: row.get(10)?,
      })
    })
    .map_err(|e| format!("could_not_query_persisted_queue: {e}"))?;

  Ok(
    rows
      .filter_map(Result::ok)
      .filter(|job| !is_fully_transferred_job(job.bytes_downloaded, job.total_bytes))
      .collect(),
  )
}

pub(super) fn is_resumable_queue_status(status: &str) -> bool {
  is_resumable_status(status)
}

/// Jobs terminados no SQLite (sidecar morre ao fechar — sem isto a lista some).
pub fn list_history_persisted_jobs(conn: &Connection) -> Result<Vec<PersistedQueueJob>, String> {
  ensure_persisted_queue_table(conn)?;
  let mut stmt = conn
    .prepare(
      "SELECT id, title, url, dest_path, status, priority, progress, bytes_downloaded, total_bytes, error_msg, source_name \
       FROM persisted_queue_jobs \
       WHERE status IN ('completed', 'extracted', 'failed', 'cancelled', 'skipped') \
       ORDER BY updated_at DESC \
       LIMIT 80",
    )
    .map_err(|e| format!("could_not_prepare_persisted_history_list: {e}"))?;

  let rows = stmt
    .query_map([], |row| {
      Ok(PersistedQueueJob {
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
        source_name: row.get(10)?,
      })
    })
    .map_err(|e| format!("could_not_query_persisted_history: {e}"))?;

  Ok(rows.filter_map(Result::ok).collect())
}
