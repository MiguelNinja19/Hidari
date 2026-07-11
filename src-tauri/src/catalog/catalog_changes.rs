use crate::db::open_database_connection;
use crate::dto::CatalogChangeDto;
use rusqlite::{params, Connection};
use tauri::AppHandle;

pub fn record_catalog_snapshot(conn: &Connection, source_id: &str, entry_count: i64, hash: &str) {
  let _ = conn.execute(
    "INSERT INTO catalog_sync_snapshots (source_id, entry_count, payload_hash, synced_at) \
     VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP) \
     ON CONFLICT(source_id) DO UPDATE SET \
       entry_count = excluded.entry_count, \
       payload_hash = excluded.payload_hash, \
       synced_at = excluded.synced_at",
    params![source_id, entry_count, hash],
  );
}

#[tauri::command]
pub fn check_catalog_changes(app: AppHandle) -> Result<Vec<CatalogChangeDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare(
      "SELECT hds.id, hds.name, hds.download_count, \
              COALESCE(css.entry_count, 0) \
       FROM hydra_download_sources hds \
       LEFT JOIN catalog_sync_snapshots css ON css.source_id = hds.id",
    )
    .map_err(|e| format!("could_not_prepare_catalog_changes: {e}"))?;
  let rows: Vec<(String, String, i64, i64)> = stmt
    .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
    .map_err(|e| format!("could_not_query_catalog_changes: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_catalog_changes: {e}"))?;

  let mut changes = Vec::new();
  for (source_id, source_name, current_count, prev_count) in rows {
    if current_count > prev_count {
      changes.push(CatalogChangeDto {
        source_id,
        source_name,
        new_count: current_count - prev_count,
      });
    }
  }
  Ok(changes)
}
