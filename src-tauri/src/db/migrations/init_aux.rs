use rusqlite::Connection;

pub(super) fn create_aux_tables(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      "
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
    .map_err(|e| format!("could_not_initialize_database: {e}"))
}
