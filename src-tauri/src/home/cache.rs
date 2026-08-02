//! SQLite cache for Hydra catalogue responses. 30-minute TTL.

use rusqlite::{params, Connection};
use std::time::{SystemTime, UNIX_EPOCH};

const TTL_SECS: u64 = 30 * 60; // 30 minutes

fn now_ts() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs() as i64
}

/// Initialize the home_cache table. Idempotent.
pub fn init_cache(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      "CREATE TABLE IF NOT EXISTS home_cache (
        key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
      );",
    )
    .map_err(|e| format!("init home_cache: {e}"))?;
  Ok(())
}

/// Read cached payload if fresh (within TTL). Returns None if stale or missing.
pub fn read_cache(conn: &Connection, key: &str) -> Option<String> {
  let now = now_ts();
  let mut stmt = conn
    .prepare("SELECT payload_json, fetched_at FROM home_cache WHERE key = ?1")
    .ok()?;
  let row = stmt
    .query_row(params![key], |r| {
      Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
    })
    .ok()?;
  if now - row.1 < TTL_SECS as i64 {
    Some(row.0)
  } else {
    None
  }
}

/// Write/update cache entry.
pub fn write_cache(conn: &Connection, key: &str, payload: &str) -> Result<(), String> {
  conn
    .execute(
      "INSERT OR REPLACE INTO home_cache (key, payload_json, fetched_at) VALUES (?1, ?2, ?3)",
      params![key, payload, now_ts()],
    )
    .map_err(|e| format!("write home_cache: {e}"))?;
  Ok(())
}

/// Cached lookup helper. Returns cached value if fresh, otherwise calls the
/// fetcher function, stores the result, and returns it.
pub fn cached_or_fetch<F>(conn: &Connection, key: &str, fetcher: F) -> Result<String, String>
where
  F: FnOnce() -> Result<String, String>,
{
  if let Some(cached) = read_cache(conn, key) {
    return Ok(cached);
  }
  let fresh = fetcher()?;
  write_cache(conn, key, &fresh)?;
  Ok(fresh)
}
