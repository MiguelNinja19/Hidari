use crate::library::roots::open_path_in_shell;
use crate::sources::catalog_cache_dir;
use tauri::AppHandle;

#[tauri::command]
pub fn open_catalogs_cache_folder(app: AppHandle) -> Result<String, String> {
  let dir = catalog_cache_dir(&app)?;
  std::fs::create_dir_all(&dir)
    .map_err(|error| format!("could_not_create_catalogs_folder: {error}"))?;
  open_path_in_shell(&dir)?;
  Ok(dir.to_string_lossy().into_owned())
}
