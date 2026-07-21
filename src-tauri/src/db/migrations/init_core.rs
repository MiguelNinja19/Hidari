use rusqlite::Connection;

pub(super) fn create_core_tables(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      "
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
      ",
    )
    .map_err(|e| format!("could_not_initialize_database: {e}"))
}
