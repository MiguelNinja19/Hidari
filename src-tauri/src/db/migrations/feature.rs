use rusqlite::Connection;

pub(crate) fn migrate_feature_tables(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      "CREATE TABLE IF NOT EXISTS steam_game_details (
        app_id INTEGER PRIMARY KEY,
        payload_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS favorite_catalog_entries (
        catalog_key TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS game_collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS collection_entries (
        collection_id TEXT NOT NULL,
        catalog_key TEXT NOT NULL,
        title TEXT NOT NULL,
        PRIMARY KEY (collection_id, catalog_key),
        FOREIGN KEY (collection_id) REFERENCES game_collections(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS catalog_sync_snapshots (
        source_id TEXT PRIMARY KEY,
        entry_count INTEGER NOT NULL DEFAULT 0,
        payload_hash TEXT NOT NULL DEFAULT '',
        synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS library_play_stats (
        path_key TEXT PRIMARY KEY,
        last_played_at TEXT,
        play_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS library_notes (
        path_key TEXT PRIMARY KEY,
        note TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS library_launch_exe (
        library_key TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        dest_path   TEXT NOT NULL,
        exe_path    TEXT NOT NULL,
        updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS home_cache (
        key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
      );",
    )
    .map_err(|e| format!("migrate_feature_tables: {e}"))?;
  crate::favorites::migrate_favorite_catalog_entries(conn)?;
  Ok(())
}
