use rusqlite::{params, Connection};

use super::super::settings::read_app_setting;

pub(crate) fn migrate_drop_legacy_tables(conn: &Connection) -> Result<(), String> {
  const KEY: &str = "legacy_tables_dropped_v1";
  if read_app_setting(conn, KEY).is_some() {
    return Ok(());
  }
  conn
    .execute_batch(
      "DROP TABLE IF EXISTS collection_games;
       DROP TABLE IF EXISTS collections;
       DROP TABLE IF EXISTS download_source_changes;
       DROP TABLE IF EXISTS games;
       DROP TABLE IF EXISTS download_sources;",
    )
    .map_err(|e| format!("migrate_drop_legacy_tables: {e}"))?;
  conn
    .execute(
      "INSERT INTO app_settings (key, value) VALUES (?1, '1')",
      params![KEY],
    )
    .map_err(|e| format!("migrate_drop_legacy_mark: {e}"))?;
  Ok(())
}
