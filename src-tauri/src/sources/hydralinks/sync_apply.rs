use super::cache_memory::remember_in_memory;
use super::db_read::stored_payload_hash;
use super::db_write::write_catalog_to_db;
use super::names::resolve_source_display_name;
use super::parse::parse_catalog_json;
use super::presence::has_local_catalog;
use super::types::SyncCatalogOutcome;
use super::util::payload_hash;
use crate::db::open_database_connection;
use rusqlite::params;
use std::path::Path;
use tauri::AppHandle;

pub(crate) fn download_catalog_fallback(
  app: &AppHandle,
  source_id: &str,
  error: Option<String>,
) -> Result<(SyncCatalogOutcome, Option<crate::sources::hydra::HydraApiDownloadSource>), String> {
  if !has_local_catalog(app, source_id) {
    return Err(error.unwrap_or_else(|| "Atualização online falhou.".to_string()));
  }
  let count = if let Ok(conn) = open_database_connection(app) {
    conn
      .query_row(
        "SELECT COUNT(*) FROM hydra_catalog_entries WHERE source_id = ?1",
        params![source_id],
        |row| row.get::<_, i64>(0),
      )
      .unwrap_or(0) as usize
  } else {
    0
  };
  let detail = error.unwrap_or_else(|| "Sem conexão.".to_string());
  Ok((
    SyncCatalogOutcome::OfflineOnly {
      count,
      warning: format!(
        "Catálogo local mantido ({count} entradas). {detail}"
      ),
    },
    None,
  ))
}

pub(crate) fn apply_downloaded_catalog_body(
  app: &AppHandle,
  source_id: &str,
  local_path: &str,
  path: &Path,
  body: &str,
  api_meta: Option<crate::sources::hydra::HydraApiDownloadSource>,
) -> Result<(SyncCatalogOutcome, Option<crate::sources::hydra::HydraApiDownloadSource>), String> {
  let hash = payload_hash(body);

  if let Ok(conn) = open_database_connection(app) {
    if stored_payload_hash(&conn, source_id).as_deref() == Some(hash.as_str()) {
      let count = conn
        .query_row(
          "SELECT COUNT(*) FROM hydra_catalog_entries WHERE source_id = ?1",
          params![source_id],
          |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) as usize;
      return Ok((SyncCatalogOutcome::Unchanged(count), api_meta));
    }
  }

  let catalog = parse_catalog_json(body)
    .map_err(|error| format!("O catálogo baixado não é válido: {error}"))?;
  let count = catalog.downloads.len();

  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent)
      .map_err(|error| format!("Não foi possível criar a pasta do catálogo: {error}"))?;
  }

  std::fs::write(path, body)
    .map_err(|error| format!("Não foi possível gravar o arquivo local: {error}"))?;

  write_catalog_to_db(app, source_id, local_path.trim(), body, &catalog)?;
  remember_in_memory(source_id, catalog.clone());
  if let Some(name) = catalog.name.as_deref() {
    let display = resolve_source_display_name(Some(name), None, local_path);
    if let Ok(conn) = open_database_connection(app) {
      let _ = crate::sources::hydra::persist_hydra_source_display_name(&conn, source_id, &display);
    }
  }
  Ok((SyncCatalogOutcome::Updated(count), api_meta))
}
