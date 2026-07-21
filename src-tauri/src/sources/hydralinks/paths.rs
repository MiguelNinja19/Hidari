use super::paths_local::resolve_local_catalog_path_for_write;
use super::parse::normalize_catalog_body;
use super::url_detect::normalize_remote_catalog_url;
use super::util::payload_hash;
use crate::config;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn catalog_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
  app
    .path()
    .app_data_dir()
    .map_err(|error| format!("Não foi possível resolver a pasta de dados da aplicação: {error}"))
    .map(|dir| dir.join("catalogs"))
}

pub fn catalog_cache_path_for_remote_url(
  app: &AppHandle,
  remote_url: &str,
) -> Result<PathBuf, String> {
  let normalized = normalize_remote_catalog_url(remote_url)?;
  let file_name = catalog_file_name_from_path(&normalized)?;
  Ok(catalog_cache_dir(app)?.join(file_name))
}

fn catalog_import_cache_path_in_dir(
  cache_dir: &Path,
  external_path: &Path,
  body: &str,
) -> Result<PathBuf, String> {
  let file_name = external_path
    .file_name()
    .and_then(|name| name.to_str())
    .ok_or_else(|| "Não foi possível determinar o nome do arquivo .json.".to_string())?;
  let target = cache_dir.join(file_name);
  let normalized_body = normalize_catalog_body(body);

  if target.is_file() {
    let existing = std::fs::read_to_string(&target).unwrap_or_default();
    if normalize_catalog_body(&existing) == normalized_body {
      return Ok(target);
    }
    let stem = Path::new(file_name)
      .file_stem()
      .and_then(|name| name.to_str())
      .unwrap_or("catalog");
    let suffix = &payload_hash(&normalized_body)[..8];
    return Ok(cache_dir.join(format!("{stem}-{suffix}.json")));
  }

  Ok(target)
}
/// Destino em `AppData/.../catalogs/` para uma importação local (evita colisões).
pub fn catalog_import_cache_path(
  app: &AppHandle,
  external_path: &Path,
  body: &str,
) -> Result<PathBuf, String> {
  let cache_dir = catalog_cache_dir(app)?;
  catalog_import_cache_path_in_dir(&cache_dir, external_path, body)
}
pub(crate) fn catalog_file_name_from_path(local_path: &str) -> Result<String, String> {
  let path = resolve_local_catalog_path_for_write(local_path)?;
  path
    .file_name()
    .and_then(|name| name.to_str())
    .map(str::to_string)
    .ok_or_else(|| "Não foi possível determinar o nome do arquivo .json.".to_string())
}
pub fn hydralinks_mirror_url_for_file(file_name: &str) -> Option<String> {
  let template = std::env::var(config::HYDRALINKS_MIRROR_URL_ENV)
    .ok()?
    .trim()
    .to_string();
  if template.is_empty() {
    return None;
  }
  if template.contains("{file}") {
    Some(template.replace("{file}", file_name))
  } else {
    Some(format!(
      "{}/{}",
      template.trim_end_matches('/'),
      file_name
    ))
  } }
/// URL remota no hydralinks a partir do nome do ficheiro local (ex.: fitgirl.json).
pub fn hydralinks_remote_url_for_local_path(local_path: &str) -> Option<String> {
  let path = resolve_local_catalog_path_for_write(local_path).ok()?;
  let file_name = path.file_name()?.to_str()?;
  if !file_name.to_lowercase().ends_with(".json") {
    return None;
  }
  Some(format!(
    "{}/{}",
    config::HYDRALINKS_SOURCES_BASE.trim_end_matches('/'),
    file_name
  ))
}
