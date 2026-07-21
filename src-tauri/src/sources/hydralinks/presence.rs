use super::cache_memory::read_memory_cache;
use super::db_read::read_catalog_from_db;
use super::paths_local::resolve_local_catalog_path;
use crate::db::open_database_connection;
use rusqlite::params;
use tauri::AppHandle;

pub fn has_local_catalog(app: &AppHandle, source_id: &str) -> bool {
  if read_memory_cache(source_id).is_some() {
    return true;
  }
  if let Ok(conn) = open_database_connection(app) {
    if let Ok(source) = crate::sources::hydra::get_hydra_source_by_id(&conn, source_id) {
      if resolve_local_catalog_path(&source.url).is_some() {
        return true;
      }
    }
  }
  if read_catalog_from_db(app, source_id).is_some() {
    return true;
  }
  if let Ok(conn) = open_database_connection(app) {
    let count: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM hydra_catalog_entries WHERE source_id = ?1",
        params![source_id],
        |row| row.get(0),
      )
      .unwrap_or(0);
    if count > 0 {
      return true;
    }
  }
  false
}
