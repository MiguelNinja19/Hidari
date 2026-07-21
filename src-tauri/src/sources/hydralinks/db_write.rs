use super::cache_memory::memory_cache;
use super::types::HydraLinksCatalog;
use super::util::{now_unix_ms, payload_hash};
use crate::catalog::normalize_match_text;
use crate::db::open_database_connection;
use rusqlite::{params, Connection};
use tauri::AppHandle;

fn rebuild_catalog_index(
  conn: &Connection,
  source_id: &str,
  catalog: &HydraLinksCatalog,
) -> Result<(), String> {
  conn
    .execute(
      "DELETE FROM hydra_catalog_entries WHERE source_id = ?1",
      params![source_id],
    )
    .map_err(|error| format!("could_not_clear_catalog_index: {error}"))?;

  let mut stmt = conn
    .prepare(
      "INSERT INTO hydra_catalog_entries \
       (source_id, title, title_norm, file_size, uris_json, group_key, display_title) \
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .map_err(|error| format!("could_not_prepare_catalog_index: {error}"))?;

  for download in &catalog.downloads {
    let title_norm = normalize_match_text(&download.title);
    if title_norm.is_empty() {
      continue;
    }
    let group_key = crate::title::catalog_game_group_key(&download.title);
    let display_title = crate::title::clean_title_for_matching(&download.title);
    let uris_json = serde_json::to_string(&download.uris)
      .map_err(|error| format!("could_not_encode_uris: {error}"))?;
    stmt
      .execute(params![
        source_id,
        download.title,
        title_norm,
        download.file_size,
        uris_json,
        group_key,
        display_title,
      ])
      .map_err(|error| format!("could_not_insert_catalog_index: {error}"))?;
  }

  Ok(())
}

pub(crate) fn write_catalog_to_db(
  app: &AppHandle,
  source_id: &str,
  source_ref: &str,
  body: &str,
  catalog: &HydraLinksCatalog,
) -> Result<(), String> {
  let conn = open_database_connection(app)?;
  let hash = payload_hash(body);
  conn
    .execute(
      "INSERT INTO hydra_source_catalogs (source_id, source_url, payload_json, payload_hash, fetched_at) \
       VALUES (?1, ?2, ?3, ?4, ?5) \
       ON CONFLICT(source_id) DO UPDATE SET \
         source_url = excluded.source_url, \
         payload_json = excluded.payload_json, \
         payload_hash = excluded.payload_hash, \
         fetched_at = excluded.fetched_at",
      params![source_id, source_ref, body, hash, now_unix_ms()],
    )
    .map_err(|error| format!("could_not_save_source_catalog: {error}"))?;
  rebuild_catalog_index(&conn, source_id, catalog)?;
  Ok(())
}

pub fn delete_source_catalog(app: &AppHandle, source_id: &str) {
  if let Ok(conn) = open_database_connection(app) {
    let _ = conn.execute(
      "DELETE FROM hydra_catalog_entries WHERE source_id = ?1",
      params![source_id],
    );
    let _ = conn.execute(
      "DELETE FROM hydra_source_catalogs WHERE source_id = ?1",
      params![source_id],
    );
  }
  if let Ok(mut cache) = memory_cache().lock() {
    cache.remove(source_id);
  }
}
