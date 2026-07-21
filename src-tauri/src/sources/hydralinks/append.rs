use super::cache_memory::remember_in_memory;
use super::db_entries::catalog_from_indexed_entries;
use super::paths_resolve::resolve_api_cache_json_path;
use super::util::{now_unix_ms, payload_hash};
use crate::catalog::normalize_match_text;
use crate::db::open_database_connection;
use crate::dto::DownloadOptionDto;
use rusqlite::params;
use tauri::AppHandle;

pub fn append_catalog_download_options(
  app: &AppHandle,
  source_id: &str,
  source_ref: &str,
  options: &[DownloadOptionDto],
) -> Result<usize, String> {
  if options.is_empty() {
    return Ok(0); }

  let conn = open_database_connection(app)?;
  let mut stmt = conn .prepare(
      "INSERT INTO hydra_catalog_entries \
       (source_id, title, title_norm, file_size, uris_json, group_key, display_title) \
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 \
       WHERE NOT EXISTS ( \
         SELECT 1 FROM hydra_catalog_entries \
         WHERE source_id = ?1 AND title = ?2 AND uris_json = ?5 \
       )", )
    .map_err(|error| format!("could_not_prepare_append_catalog: {error}"))?;

  let mut inserted = 0usize;
  for option in options {
    let title_norm = normalize_match_text(&option.title);
    if title_norm.is_empty() {
      continue; }
    let uris_json =
      serde_json::to_string(&[option.url.as_str()]).map_err(|e| format!("encode_uri: {e}"))?;
    let group_key = crate::title::catalog_game_group_key(&option.title);
    let display_title = crate::title::clean_title_for_matching(&option.title);
    let quality = option.quality.trim();
    let file_size = if quality.is_empty() || quality.starts_with("Link ") {
      None } else {
      Some(quality.to_string())
    }; let changed = stmt
      .execute(params![
        source_id, option.title,
        title_norm,
        file_size, uris_json,
        group_key,
        display_title, ])
      .map_err(|error| format!("could_not_append_catalog_entry: {error}"))?;
    if changed > 0 {
      inserted += 1;
    } } drop(stmt);

  if inserted == 0 {
    return Ok(0); }

  let source_name = conn
    .query_row(
      "SELECT name FROM hydra_download_sources WHERE id = ?1",
      params![source_id],
      |row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "Catálogo".to_string());

  let catalog = catalog_from_indexed_entries(&conn, source_id, &source_name)?;
  let body = serde_json::to_string_pretty(&catalog)
    .map_err(|error| format!("could_not_encode_catalog_json: {error}"))?;
  let hash = payload_hash(&body);

  let cache_path = resolve_api_cache_json_path(app, source_id, source_ref)?;
  if let Some(parent) = cache_path.parent() {
    std::fs::create_dir_all(parent)
      .map_err(|error| format!("could_not_create_catalogs_folder: {error}"))?;
  }
  std::fs::write(&cache_path, &body)
    .map_err(|error| format!("could_not_write_catalog_json: {error}"))?;
  let cache_path_str = cache_path.to_string_lossy().into_owned();

  conn .execute(
      "INSERT INTO hydra_source_catalogs (source_id, source_url, payload_json, payload_hash, fetched_at) \
       VALUES (?1, ?2, ?3, ?4, ?5) \
       ON CONFLICT(source_id) DO UPDATE SET \
         source_url = excluded.source_url, \
         payload_json = excluded.payload_json, \
         payload_hash = excluded.payload_hash, \
         fetched_at = excluded.fetched_at",
      params![source_id, cache_path_str, body, hash, now_unix_ms()],
    )
    .map_err(|error| format!("could_not_save_source_catalog: {error}"))?;

  let _ = conn.execute(
    "UPDATE hydra_download_sources SET url = ?1, download_count = ?2 WHERE id = ?3",
    params![cache_path_str, catalog.downloads.len() as i64, source_id],
  );

  remember_in_memory(source_id, catalog);
  Ok(inserted) }
