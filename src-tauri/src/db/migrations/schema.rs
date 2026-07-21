use rusqlite::Connection;

use super::feature::migrate_feature_tables;
use super::legacy::migrate_drop_legacy_tables;

pub(crate) fn migrate_schema(conn: &Connection) -> Result<(), String> {
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
  let has_remote_url = conn
    .prepare("PRAGMA table_info(hydra_download_sources)")
    .map_err(|e| format!("migrate_pragma_hds_remote: {e}"))?
    .query_map([], |row| row.get::<_, String>(1))
    .map_err(|e| format!("migrate_pragma_hds_remote_map: {e}"))?
    .filter_map(Result::ok)
    .any(|name| name == "remote_url");
  if !has_remote_url {
    conn
      .execute(
        "ALTER TABLE hydra_download_sources ADD COLUMN remote_url TEXT",
        [],
      )
      .map_err(|e| format!("migrate_remote_url: {e}"))?;
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
  migrate_drop_legacy_tables(conn)?;
  migrate_feature_tables(conn)?;
  conn
    .execute(
      "CREATE INDEX IF NOT EXISTS idx_hce_group_key ON hydra_catalog_entries(group_key)",
      [],
    )
    .ok();
  conn
    .execute(
      "CREATE INDEX IF NOT EXISTS idx_game_covers_updated_at ON game_covers(updated_at DESC)",
      [],
    )
    .ok();
  crate::queue::persist::ensure_persisted_queue_table(conn)?;
  Ok(())
}
