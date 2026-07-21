use crate::db::{open_database_connection, validate_app_setting_key};
use crate::dto::{GetAppSettingPayload, SetAppSettingPayload};
use rusqlite::params;
use rusqlite::OptionalExtension;
use tauri::AppHandle;

#[tauri::command]
pub fn get_app_setting(app: AppHandle, payload: GetAppSettingPayload) -> Result<Option<String>, String> {
  validate_app_setting_key(&payload.key)?;
  let conn = open_database_connection(&app)?;
  let value: Option<String> = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = ?1",
      params![&payload.key],
      |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("could_not_get_app_setting: {e}"))?;
  Ok(value)
}

#[tauri::command]
pub fn set_app_setting(app: AppHandle, payload: SetAppSettingPayload) -> Result<(), String> {
  validate_app_setting_key(&payload.key)?;
  if payload.value.len() > 65_000 {
    return Err("app_setting_value_too_large".to_string());
  }
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "INSERT INTO app_settings (key, value) VALUES (?1, ?2) \
       ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      params![&payload.key, &payload.value],
    )
    .map_err(|e| format!("could_not_set_app_setting: {e}"))?;
  Ok(())
}
