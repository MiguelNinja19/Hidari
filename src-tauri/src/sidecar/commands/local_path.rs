use crate::library::roots::open_path_in_shell;
use tauri::AppHandle;

#[tauri::command]
pub fn open_local_path(app: AppHandle, path: String) -> Result<(), String> {
  let validated = crate::path_security::validate_managed_path(&app, &path)?;
  open_path_in_shell(&validated)
}
