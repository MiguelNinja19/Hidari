use rusqlite::{params, Connection};
use rusqlite::OptionalExtension;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};

static SCHEMA_MIGRATED: AtomicBool = AtomicBool::new(false);

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("could_not_get_app_data_dir: {e}"))?;
  std::fs::create_dir_all(&dir).map_err(|e| format!("could_not_create_app_data_dir: {e}"))?;
  Ok(dir.join("launcher.db"))
}

/// Migrações e seed só no arranque; invokes seguintes reutilizam WAL mode.
pub fn init_database_pool(app: &AppHandle) -> Result<(), String> {
  let _ = open_database_connection(app)?;
  Ok(())
}

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
  let conn = Connection::open(database_path(app)?)
    .map_err(|e| format!("could_not_open_db: {e}"))?;
  let _ = conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
  if !SCHEMA_MIGRATED.load(Ordering::Acquire) {
    initialize_database(&conn)?;
    migrate_schema(&conn)?;
    crate::sources::hydra::ensure_default_hydra_sources(&conn)?;
    SCHEMA_MIGRATED.store(true, Ordering::Release);
  }
  Ok(conn)
}

fn migrate_schema(conn: &Connection) -> Result<(), String> {
  let has_hash = conn
    .prepare("PRAGMA table_info(hydra_source_catalogs)")
    .map_err(|e| format!("migrate_pragma: {e}"))?
    .query_map([], |row| row.get::<_, String>(1))
    .map_err(|e| format!("migrate_pragma_map: {e}"))?
    .filter_map(Result::ok)
    .any(|name| name == "payload_hash");
  if !has_hash {
    conn
      .execute(
        "ALTER TABLE hydra_source_catalogs ADD COLUMN payload_hash TEXT",
        [],
      )
      .map_err(|e| format!("migrate_payload_hash: {e}"))?;
  }
  let has_api_id = conn
    .prepare("PRAGMA table_info(hydra_download_sources)")
    .map_err(|e| format!("migrate_pragma_hds: {e}"))?
    .query_map([], |row| row.get::<_, String>(1))
    .map_err(|e| format!("migrate_pragma_hds_map: {e}"))?
    .filter_map(Result::ok)
    .any(|name| name == "api_source_id");
  if !has_api_id {
    conn
      .execute(
        "ALTER TABLE hydra_download_sources ADD COLUMN api_source_id TEXT",
        [],
      )
      .map_err(|e| format!("migrate_api_source_id: {e}"))?;
  }
  conn
    .execute_batch(
      "CREATE TABLE IF NOT EXISTS cover_precache_skip (
        title_key TEXT PRIMARY KEY,
        tried_at  INTEGER NOT NULL
      );",
    )
    .map_err(|e| format!("migrate_cover_precache_skip: {e}"))?;
  conn
    .execute_batch(
      "CREATE TABLE IF NOT EXISTS steam_app_index (
        app_id     INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        name_norm  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_steam_app_index_name_norm ON steam_app_index(name_norm);",
    )
    .map_err(|e| format!("migrate_steam_app_index: {e}"))?;
  Ok(())
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

      CREATE TABLE IF NOT EXISTS hydra_source_catalogs (
        source_id    TEXT PRIMARY KEY,
        source_url   TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT,
        fetched_at   INTEGER NOT NULL,
        FOREIGN KEY (source_id) REFERENCES hydra_download_sources(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS hydra_catalog_entries (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id     TEXT NOT NULL,
        title         TEXT NOT NULL,
        title_norm    TEXT NOT NULL,
        file_size     TEXT,
        uris_json     TEXT NOT NULL,
        group_key     TEXT NOT NULL DEFAULT '',
        display_title TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (source_id) REFERENCES hydra_download_sources(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_hce_source_title ON hydra_catalog_entries(source_id, title_norm);

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

      CREATE TABLE IF NOT EXISTS cover_precache_skip (
        title_key TEXT PRIMARY KEY,
        tried_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS library_game_roots (
        library_key TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        dest_path   TEXT NOT NULL,
        game_root   TEXT NOT NULL,
        updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS steam_app_index (
        app_id     INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        name_norm  TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_steam_app_index_name_norm ON steam_app_index(name_norm);
      ",
    )
    .map_err(|e| format!("could_not_initialize_database: {e}"))?;
  migrate_catalog_steam_cache_hd_covers(conn)?;
  migrate_catalog_group_keys(conn)
}
fn migrate_catalog_group_keys(conn: &Connection) -> Result<(), String> {
  const KEY: &str = "catalog_group_keys_v1";

  let _ = conn.execute(
    "ALTER TABLE hydra_catalog_entries ADD COLUMN group_key TEXT NOT NULL DEFAULT ''",
    [],
  );
  let _ = conn.execute(
    "ALTER TABLE hydra_catalog_entries ADD COLUMN display_title TEXT NOT NULL DEFAULT ''",
    [],
  );
  let _ = conn.execute(
    "CREATE INDEX IF NOT EXISTS idx_hce_source_group ON hydra_catalog_entries(source_id, group_key)",
    [],
  );

  if read_app_setting(conn, KEY).is_some() {
    return Ok(());
  }

  let mut update = conn
    .prepare(
      "UPDATE hydra_catalog_entries SET group_key = ?1, display_title = ?2 WHERE id = ?3",
    )
    .map_err(|e| format!("migrate_group_keys_prepare: {e}"))?;

  loop {
    let mut stmt = conn
      .prepare(
        "SELECT id, title FROM hydra_catalog_entries \
         WHERE group_key = '' OR display_title = '' LIMIT 2000",
      )
      .map_err(|e| format!("migrate_group_keys_select: {e}"))?;
    let rows: Vec<(i64, String)> = stmt
      .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
      .map_err(|e| format!("migrate_group_keys_query: {e}"))?
      .filter_map(Result::ok)
      .collect();
    if rows.is_empty() {
      break;
    }
    for (id, title) in rows {
      let group_key = crate::title::catalog_game_group_key(&title);
      let display_title = crate::title::clean_title_for_matching(&title);
      update
        .execute(params![group_key, display_title, id])
        .map_err(|e| format!("migrate_group_keys_update: {e}"))?;
    }
  }

  conn
    .execute(
      "INSERT INTO app_settings (key, value) VALUES (?1, '1')",
      params![KEY],
    )
    .map_err(|e| format!("migrate_group_keys_mark: {e}"))?;
  Ok(())
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
