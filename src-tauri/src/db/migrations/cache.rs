use rusqlite::{params, Connection};
use rusqlite::OptionalExtension;

pub(crate) fn migrate_catalog_steam_cache_hd_covers(conn: &Connection) -> Result<(), String> {
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
