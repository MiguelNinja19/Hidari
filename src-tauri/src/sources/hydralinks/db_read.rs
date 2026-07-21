use super::parse::parse_catalog_json;
use super::types::HydraLinksCatalog;
use crate::db::open_database_connection;
use rusqlite::{params, Connection};
use tauri::AppHandle;

pub(crate) fn read_catalog_from_db(app: &AppHandle, source_id: &str) -> Option<HydraLinksCatalog> {
  let conn = open_database_connection(app).ok()?;
  read_catalog_from_db_conn(&conn, source_id)
}

pub(crate) fn read_catalog_from_db_conn(conn: &Connection, source_id: &str) -> Option<HydraLinksCatalog> {
  conn
    .query_row(
      "SELECT payload_json FROM hydra_source_catalogs WHERE source_id = ?1",
      params![source_id],
      |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|payload| parse_catalog_json(&payload).ok())
}
pub(crate) fn stored_payload_hash(conn: &Connection, source_id: &str) -> Option<String> {
  conn
    .query_row(
      "SELECT payload_hash FROM hydra_source_catalogs WHERE source_id = ?1",
      params![source_id],
      |row| row.get(0),
    )
    .ok()
}
