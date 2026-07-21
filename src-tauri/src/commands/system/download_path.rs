use crate::db::open_database_connection;
use crate::dto::SetDefaultDownloadPathPayload;
use rusqlite::params;
use tauri::AppHandle;

#[tauri::command]
pub fn set_default_download_path(
  app: AppHandle,
  payload: SetDefaultDownloadPathPayload,
) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  let path = crate::path_security::validate_download_root_setting(&payload.path)?;
  conn
    .execute(
      "INSERT INTO app_settings (key, value) VALUES ('default_download_path', ?1) \
       ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      params![path],
    )
    .map_err(|error| format!("could_not_set_default_download_path: {error}"))?;
  Ok(())
}

#[tauri::command]
pub fn get_default_download_path(app: AppHandle) -> Result<Option<String>, String> {
  crate::db::get_default_download_path(&app)
}
