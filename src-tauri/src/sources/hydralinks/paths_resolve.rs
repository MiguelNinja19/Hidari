use super::paths::{catalog_cache_dir, catalog_cache_path_for_remote_url};
use super::paths_local::resolve_local_catalog_path_for_write;
use super::url_detect::is_remote_catalog_url;
use crate::db::open_database_connection;
use rusqlite::params;
use std::path::PathBuf;
use tauri::AppHandle;

pub(crate) fn resolve_api_cache_json_path(
  app: &AppHandle,
  source_id: &str,
  source_ref: &str,
) -> Result<PathBuf, String> {
  if let Ok(conn) = open_database_connection(app) {
    if let Ok(url) = conn.query_row(
      "SELECT url FROM hydra_download_sources WHERE id = ?1",
      params![source_id],
      |row| row.get::<_, String>(0),
    ) {
      if let Ok(path) = resolve_local_catalog_path_for_write(&url) {
        return Ok(path);
      }
    }
  }

  if is_remote_catalog_url(source_ref) {
    return catalog_cache_path_for_remote_url(app, source_ref);
  }

  if let Ok(path) = resolve_local_catalog_path_for_write(source_ref) {
    return Ok(path);
  }

  let safe_name = source_id
    .chars()
    .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
    .collect::<String>();
  Ok(catalog_cache_dir(app)?.join(format!("{safe_name}.json")))
}
