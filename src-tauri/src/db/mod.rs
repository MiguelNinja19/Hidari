use crate::dto::{DownloadJobDto, SourceDto};
use rusqlite::{params, Connection};
use rusqlite::OptionalExtension;
use std::collections::HashSet;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn validate_app_setting_key(key: &str) -> Result<(), String> {
  if key.is_empty() || key.len() > 80 {
    return Err("invalid_app_setting_key".to_string());
  }
  if !key
    .chars()
    .all(|c| c.is_ascii_alphanumeric() || c == '_')
  {
    return Err("invalid_app_setting_key".to_string());
  }
  Ok(())
}

pub fn get_disabled_hydra_source_ids_from_conn(
  conn: &Connection,
) -> Result<HashSet<String>, String> {
  let value: Option<String> = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = 'disabled_hydra_source_ids'",
      [],
      |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("could_not_read_disabled_hydra_sources: {e}"))?;
  let Some(json) = value else {
    return Ok(HashSet::new());
  };
  let list: Vec<String> = serde_json::from_str(&json)
    .map_err(|e| format!("could_not_parse_disabled_hydra_sources: {e}"))?;
  Ok(list.into_iter().collect())
}
pub fn get_default_download_path(app: &AppHandle) -> Result<Option<String>, String> {
  let conn = open_database_connection(app)?;
  let value = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = 'default_download_path'",
      [],
      |row| row.get::<_, String>(0),
    )
    .ok();
  Ok(value)
}

pub fn open_database_connection(app: &AppHandle) -> Result<Connection, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("could_not_get_app_data_dir: {e}"))?;
  std::fs::create_dir_all(&dir).map_err(|e| format!("could_not_create_app_data_dir: {e}"))?;
  let conn = Connection::open(dir.join("launcher.db"))
    .map_err(|e| format!("could_not_open_db: {e}"))?;
  initialize_database(&conn)?;
  crate::sources::hydra::ensure_default_hydra_sources(&conn)?;
  Ok(conn)
}

fn initialize_database(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      "
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA synchronous=NORMAL;

      CREATE TABLE IF NOT EXISTS download_sources (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        base_url    TEXT    NOT NULL UNIQUE,
        status      TEXT    NOT NULL DEFAULT 'active',
        created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS games (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT    NOT NULL,
        install_path TEXT    NOT NULL,
        is_favorite  INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS download_jobs (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        title            TEXT    NOT NULL,
        url              TEXT    NOT NULL,
        dest_path        TEXT    NOT NULL,
        status           TEXT    NOT NULL DEFAULT 'pending',
        priority         INTEGER NOT NULL DEFAULT 0,
        progress         INTEGER NOT NULL DEFAULT 0,
        bytes_downloaded INTEGER NOT NULL DEFAULT 0,
        total_bytes      INTEGER NOT NULL DEFAULT 0,
        error_msg        TEXT,
        created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS collections (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL UNIQUE,
        created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS collection_games (
        collection_id INTEGER NOT NULL,
        game_id       INTEGER NOT NULL,
        PRIMARY KEY (collection_id, game_id),
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        FOREIGN KEY (game_id)       REFERENCES games(id)       ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS download_source_changes (
        game_id    INTEGER PRIMARY KEY,
        new_count  INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS hydra_download_sources (
        id             TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        url            TEXT NOT NULL,
        status         TEXT NOT NULL,
        download_count INTEGER NOT NULL DEFAULT 0,
        fingerprint    TEXT,
        created_at     TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS extraction_log (
        job_id       TEXT PRIMARY KEY,
        status       TEXT NOT NULL,
        archive_path TEXT,
        extract_path TEXT,
        error        TEXT,
        updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS catalog_steam_cache (
        query_norm   TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        fetched_ts   INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS game_covers (
        title_key   TEXT PRIMARY KEY,
        cover_url   TEXT NOT NULL,
        local_path  TEXT,
        updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS library_game_roots (
        library_key TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        dest_path   TEXT NOT NULL,
        game_root   TEXT NOT NULL,
        updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ",
    )
    .map_err(|e| format!("could_not_initialize_database: {e}"))?;
  migrate_catalog_steam_cache_hd_covers(conn)
}
fn migrate_catalog_steam_cache_hd_covers(conn: &Connection) -> Result<(), String> {
  const KEY: &str = "catalog_steam_cache_hd_covers_v1";
  let already: Option<String> = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = ?1",
      params![KEY],
      |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| format!("migrate_catalog_cache_read: {e}"))?;
  if already.is_some() {
    return Ok(());
  }
  conn
    .execute("DELETE FROM catalog_steam_cache", [])
    .map_err(|e| format!("migrate_catalog_cache_clear: {e}"))?;
  conn
    .execute(
      "INSERT INTO app_settings (key, value) VALUES (?1, '1')",
      params![KEY],
    )
    .map_err(|e| format!("migrate_catalog_cache_mark: {e}"))?;
  Ok(())
}
pub fn fetch_source_by_id(conn: &Connection, id: i64) -> Result<SourceDto, String> {
  conn
    .query_row(
      "SELECT id, name, base_url, status, created_at FROM download_sources WHERE id = ?1",
      params![id],
      |row| {
        Ok(SourceDto {
          id: row.get(0)?,
          name: row.get(1)?,
          base_url: row.get(2)?,
          status: row.get(3)?,
          created_at: row.get(4)?,
        })
      },
    )
    .map_err(|e| format!("could_not_fetch_source: {e}"))
}

pub fn map_job_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DownloadJobDto> {
  Ok(DownloadJobDto {
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
    created_at: row.get(10)?,
    updated_at: row.get(11)?,
  })
}

pub fn fetch_job_by_id(conn: &Connection, id: i64) -> Result<DownloadJobDto, String> {
  conn
    .query_row(
      "SELECT id, title, url, dest_path, status, priority, progress, bytes_downloaded, \
       total_bytes, error_msg, created_at, updated_at FROM download_jobs WHERE id = ?1",
      params![id],
      map_job_row,
    )
    .map_err(|e| format!("could_not_fetch_job: {e}"))
}
pub fn read_app_setting(conn: &Connection, key: &str) -> Option<String> {
  conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = ?1",
      params![key],
      |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
}

pub fn read_app_setting_bool(conn: &Connection, key: &str, default: bool) -> bool {
  read_app_setting(conn, key)
    .map(|value| !matches!(value.as_str(), "0" | "false" | "FALSE"))
    .unwrap_or(default)
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
