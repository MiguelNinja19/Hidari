use crate::dto::PathsPayload;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn ping() -> &'static str {
  "pong"
}

#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
  app.package_info().version.to_string()
}

#[tauri::command]
pub fn get_paths(app: AppHandle) -> Result<PathsPayload, String> {
  let data = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("could_not_get_app_data_dir: {e}"))?;
  let config = app
    .path()
    .app_config_dir()
    .map_err(|e| format!("could_not_get_app_config_dir: {e}"))?;
  let cache = app
    .path()
    .app_cache_dir()
    .map_err(|e| format!("could_not_get_app_cache_dir: {e}"))?;
  Ok(PathsPayload {
    app_data_dir: data.to_string_lossy().to_string(),
    app_config_dir: config.to_string_lossy().to_string(),
    app_cache_dir: cache.to_string_lossy().to_string(),
  })
}
