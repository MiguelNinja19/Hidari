use rusqlite::{params, Connection};
use rusqlite::OptionalExtension;
use std::path::PathBuf;
use tauri::AppHandle;

use super::super::pool::open_database_connection;

pub struct ExtractionLogRow {
  pub status: String,
  pub extract_path: Option<String>,
  pub error: Option<String>,
}

pub fn upsert_extraction_log(
  conn: &Connection,
  job_id: &str,
  status: &str,
  archive_path: Option<&str>,
  extract_path: Option<&str>,
  error: Option<&str>,
) -> Result<(), String> {
  conn
    .execute(
      "INSERT INTO extraction_log (job_id, status, archive_path, extract_path, error, updated_at) \
       VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP) \
       ON CONFLICT(job_id) DO UPDATE SET \
         status = excluded.status, \
         archive_path = excluded.archive_path, \
         extract_path = excluded.extract_path, \
         error = excluded.error, \
         updated_at = CURRENT_TIMESTAMP",
      params![job_id, status, archive_path, extract_path, error],
    )
    .map_err(|e| format!("could_not_upsert_extraction_log: {e}"))?;
  Ok(())
}

pub fn get_extraction_status(conn: &Connection, job_id: &str) -> Option<String> {
  conn
    .query_row(
      "SELECT status FROM extraction_log WHERE job_id = ?1",
      params![job_id],
      |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
}

pub fn get_extraction_extract_path(conn: &Connection, job_id: &str) -> Option<PathBuf> {
  conn
    .query_row(
      "SELECT extract_path FROM extraction_log WHERE job_id = ?1",
      params![job_id],
      |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .ok()
    .flatten()
    .flatten()
    .map(PathBuf::from)
    .filter(|path| path.exists())
}

pub fn extraction_roots_for_job(app: &AppHandle, job_id: &str) -> Vec<PathBuf> {
  let Ok(conn) = open_database_connection(app) else {
    return Vec::new();
  };
  get_extraction_extract_path(&conn, job_id)
    .map(|path| vec![path])
    .unwrap_or_default()
}
