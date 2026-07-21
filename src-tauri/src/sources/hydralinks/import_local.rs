use super::cache_memory::remember_in_memory;
use super::db_write::write_catalog_to_db;
use super::names::resolve_source_display_name;
use super::parse::read_catalog_file;
use super::url_detect::is_local_catalog_path;
use super::paths::{catalog_cache_dir, catalog_import_cache_path};
use super::paths_local::resolve_local_catalog_path;
use super::types::StagedLocalCatalogImport;
use crate::db::open_database_connection;
use crate::dto::HydraSourceDto;
use rusqlite::params;
use std::path::PathBuf;
use tauri::AppHandle;

pub fn stage_local_catalog_for_import(
  app: &AppHandle,
  file_path: &str,
) -> Result<StagedLocalCatalogImport, String> {
  let path = resolve_local_catalog_path(file_path).ok_or_else(|| {
    format!(
      "Arquivo não encontrado: {file_path}. Confirme que o caminho existe e termina em .json."
    ) })?;
  let (catalog, body) = read_catalog_file(&path)?;
  let count = catalog.downloads.len();
  let cache_path = catalog_import_cache_path(app, &path, &body)?;
  if let Some(parent) = cache_path.parent() {
    std::fs::create_dir_all(parent)
      .map_err(|error| format!("Não foi possível criar a pasta do catálogo: {error}"))?;
  }
  std::fs::write(&cache_path, &body)
    .map_err(|error| format!("Não foi possível copiar o catálogo para a aplicação: {error}"))?;
  Ok(StagedLocalCatalogImport {
    cache_path: cache_path.to_string_lossy().into_owned(),
    body, catalog,
    count, }) }

pub fn finalize_local_catalog_import(
  app: &AppHandle,
  source_id: &str,
  staged: &StagedLocalCatalogImport,
) -> Result<(), String> {
  write_catalog_to_db(
    app,
    source_id,
    staged.cache_path.as_str(),
    staged.body.as_str(),
    &staged.catalog,
  )?;
  remember_in_memory(source_id, staged.catalog.clone());
  if let Some(name) = staged.catalog.name.as_deref() {
    let display = resolve_source_display_name(Some(name), None, staged.cache_path.as_str());
    if let Ok(conn) = open_database_connection(app) {
      let _ = crate::sources::hydra::persist_hydra_source_display_name(&conn, source_id, &display);
    } } Ok(()) }

/// Move catálogos antigos (caminho externo) para `catalogs/` da aplicação.
pub fn migrate_external_catalog_to_cache_if_needed(
  app: &AppHandle,
  source: &HydraSourceDto,
) -> Result<Option<String>, String> {
  if !is_local_catalog_path(&source.url) {
    return Ok(None);
  }

  let cache_root = catalog_cache_dir(app)?;
  let path = PathBuf::from(source.url.trim());
  if path.starts_with(&cache_root) {
    return Ok(None);
  }

  let Some(external) = resolve_local_catalog_path(&source.url) else {
    return Ok(None);
  };

  let body = std::fs::read_to_string(&external)
    .map_err(|error| format!("Não foi possível ler o catálogo externo: {error}"))?;
  let cache_path = catalog_import_cache_path(app, &external, &body)?;
  if !cache_path.is_file() || cache_path != external {
    if let Some(parent) = cache_path.parent() {
      std::fs::create_dir_all(parent)
        .map_err(|error| format!("Não foi possível criar a pasta do catálogo: {error}"))?;
    }
    std::fs::write(&cache_path, &body)
      .map_err(|error| format!("Não foi possível copiar o catálogo para a aplicação: {error}"))?;
  }

  let cache_path_str = cache_path.to_string_lossy().into_owned();
  let conn = open_database_connection(app)?;
  conn .execute(
      "UPDATE hydra_download_sources SET url = ?1 WHERE id = ?2",
      params![cache_path_str, source.id],
    )
    .map_err(|error| format!("could_not_migrate_catalog_path: {error}"))?;
  conn .execute(
      "UPDATE hydra_source_catalogs SET source_url = ?1 WHERE source_id = ?2",
      params![cache_path_str, source.id],
    ) .ok();
  Ok(Some(cache_path_str))
}
