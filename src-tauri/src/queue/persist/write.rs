use rusqlite::{params, Connection};

use super::schema::ensure_persisted_queue_table;
use super::types::PersistedQueueJob;

pub fn upsert_persisted_queue_job(
  conn: &Connection,
  job: &PersistedQueueJob,
) -> Result<(), String> {
  ensure_persisted_queue_table(conn)?;
  conn
    .execute(
      "INSERT INTO persisted_queue_jobs \
         (id, title, url, dest_path, status, priority, progress, bytes_downloaded, total_bytes, error_msg, source_name, updated_at) \
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, CURRENT_TIMESTAMP) \
       ON CONFLICT(id) DO UPDATE SET \
         title = excluded.title, \
         url = excluded.url, \
         dest_path = excluded.dest_path, \
         status = excluded.status, \
         priority = excluded.priority, \
         progress = excluded.progress, \
         bytes_downloaded = excluded.bytes_downloaded, \
         total_bytes = excluded.total_bytes, \
         error_msg = excluded.error_msg, \
         source_name = COALESCE(excluded.source_name, persisted_queue_jobs.source_name), \
         updated_at = CURRENT_TIMESTAMP",
      params![
        job.id,
        job.title,
        job.url,
        job.dest_path,
        job.status,
        job.priority,
        job.progress,
        job.bytes_downloaded,
        job.total_bytes,
        job.error_msg,
        job.source_name,
      ],
    )
    .map_err(|e| format!("could_not_upsert_persisted_queue_job: {e}"))?;
  Ok(())
}

pub fn update_persisted_queue_status(
  conn: &Connection,
  id: &str,
  status: &str,
  error_msg: Option<&str>,
) -> Result<(), String> {
  ensure_persisted_queue_table(conn)?;
  conn
    .execute(
      "UPDATE persisted_queue_jobs \
       SET status = ?1, \
           error_msg = COALESCE(?2, error_msg), \
           updated_at = CURRENT_TIMESTAMP \
       WHERE id = ?3",
      params![status, error_msg, id],
    )
    .map_err(|e| format!("could_not_update_persisted_queue_status: {e}"))?;
  Ok(())
}

pub fn update_persisted_queue_progress(
  conn: &Connection,
  id: &str,
  status: &str,
  progress: i64,
  bytes_downloaded: i64,
  total_bytes: i64,
  error_msg: Option<&str>,
) -> Result<(), String> {
  ensure_persisted_queue_table(conn)?;
  conn
    .execute(
      "UPDATE persisted_queue_jobs \
       SET status = ?1, \
           progress = ?2, \
           bytes_downloaded = ?3, \
           total_bytes = ?4, \
           error_msg = COALESCE(?5, error_msg), \
           updated_at = CURRENT_TIMESTAMP \
       WHERE id = ?6",
      params![status, progress, bytes_downloaded, total_bytes, error_msg, id],
    )
    .map_err(|e| format!("could_not_update_persisted_queue_progress: {e}"))?;
  Ok(())
}

pub fn delete_persisted_queue_job(conn: &Connection, id: &str) -> Result<(), String> {
  ensure_persisted_queue_table(conn)?;
  conn
    .execute("DELETE FROM persisted_queue_jobs WHERE id = ?1", params![id])
    .map_err(|e| format!("could_not_delete_persisted_queue_job: {e}"))?;
  Ok(())
}
