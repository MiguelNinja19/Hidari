use rusqlite::{params, Connection};
use rusqlite::OptionalExtension;
use std::collections::HashSet;
use tauri::AppHandle;

use super::pool::open_database_connection;

pub fn validate_app_setting_key(key: &str) -> Result<(), String> {
  if key.is_empty() || key.len() > 80 {
    return Err("invalid_app_setting_key".to_string());
  }
  if !key
    .chars()
    .all(|c| c.is_ascii_alphanumeric() || c == '_')
  {
    return Err("invalid_app_setting_key".to_string());
  }
  Ok(())
}

pub fn get_disabled_hydra_source_ids_from_conn(
  conn: &Connection,
) -> Result<HashSet<String>, String> {
  let value: Option<String> = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = 'disabled_hydra_source_ids'",
      [],
      |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("could_not_read_disabled_hydra_sources: {e}"))?;
  let Some(json) = value else {
    return Ok(HashSet::new());
  };
  let list: Vec<String> = serde_json::from_str(&json)
    .map_err(|e| format!("could_not_parse_disabled_hydra_sources: {e}"))?;
  Ok(list.into_iter().collect())
}

pub fn get_default_download_path(app: &AppHandle) -> Result<Option<String>, String> {
  let conn = open_database_connection(app)?;
  let value = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = 'default_download_path'",
      [],
      |row| row.get::<_, String>(0),
    )
    .ok();
  Ok(value)
}

pub fn read_app_setting(conn: &Connection, key: &str) -> Option<String> {
  conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = ?1",
      params![key],
      |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
}

pub fn read_app_setting_bool(conn: &Connection, key: &str, default: bool) -> bool {
  read_app_setting(conn, key)
    .map(|value| !matches!(value.as_str(), "0" | "false" | "FALSE"))
    .unwrap_or(default)
}
