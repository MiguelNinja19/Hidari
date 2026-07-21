use super::core::{is_path_under_root, validate_absolute_user_path};
use crate::db::get_default_download_path;
use std::path::PathBuf;
use tauri::AppHandle;

/// Pasta de download default: absoluto, sem `..` (pode ainda não existir).
pub fn validate_download_root_setting(raw: &str) -> Result<String, String> {
  let path = validate_absolute_user_path(raw)?;
  Ok(path.to_string_lossy().to_string())
}

/// Destino de enqueue: tem de estar sob (ou ser) a pasta de downloads configurada.
pub fn validate_enqueue_dest_path(app: &AppHandle, dest_path: &str) -> Result<String, String> {
  let candidate = validate_absolute_user_path(dest_path)?;
  let download = get_default_download_path(app)?
    .filter(|value| !value.trim().is_empty())
    .ok_or_else(|| "default_download_path_not_configured".to_string())?;
  let root = validate_absolute_user_path(&download)?;
  if !is_path_under_root(&candidate, &root) {
    return Err("path_outside_default_download_path".to_string());
  }
  Ok(candidate.to_string_lossy().to_string())
}

/// Paths usados para launch / open / delete: pasta de downloads, game roots ou dirs da app.
pub fn validate_managed_path(app: &AppHandle, raw: &str) -> Result<PathBuf, String> {
  let candidate = validate_absolute_user_path(raw)?;
  let roots = super::roots::app_managed_roots(app);
  if roots.is_empty() {
    return Err("no_allowed_path_roots".to_string());
  }
  if roots.iter().any(|root| is_path_under_root(&candidate, root)) {
    return Ok(candidate);
  }
  Err("path_outside_allowed_roots".to_string())
}

/// `game_root` escolhido pelo utilizador: absoluto, sem `..`, e tem de existir como pasta.
pub fn validate_existing_directory(raw: &str) -> Result<PathBuf, String> {
  let path = validate_absolute_user_path(raw)?;
  if !path.is_dir() {
    return Err("path_not_a_directory".to_string());
  }
  Ok(path)
}
