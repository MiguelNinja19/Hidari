use rusqlite::Connection;

pub fn ensure_persisted_queue_table(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      "CREATE TABLE IF NOT EXISTS persisted_queue_jobs (
         id TEXT PRIMARY KEY NOT NULL,
         title TEXT NOT NULL,
         url TEXT NOT NULL,
         dest_path TEXT NOT NULL,
         status TEXT NOT NULL,
         priority INTEGER NOT NULL DEFAULT 0,
         progress INTEGER NOT NULL DEFAULT 0,
         bytes_downloaded INTEGER NOT NULL DEFAULT 0,
         total_bytes INTEGER NOT NULL DEFAULT 0,
         error_msg TEXT,
         updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
       );
       CREATE INDEX IF NOT EXISTS idx_persisted_queue_status
         ON persisted_queue_jobs(status);",
    )
    .map_err(|e| format!("could_not_create_persisted_queue_jobs: {e}"))
}
