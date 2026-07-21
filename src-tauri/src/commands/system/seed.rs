use crate::db::open_database_connection;
use crate::dto::SetSeedTorrentsEnabledPayload;
use rusqlite::params;
use tauri::AppHandle;

#[tauri::command]
pub fn set_seed_torrents_enabled(
  app: AppHandle,
  payload: SetSeedTorrentsEnabledPayload,
) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  let value = if payload.enabled { "1" } else { "0" };
  conn
    .execute(
      "INSERT INTO app_settings (key, value) VALUES ('seed_torrents_enabled', ?1) \
       ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      params![value],
    )
    .map_err(|error| format!("could_not_set_seed_torrents_enabled: {error}"))?;
  Ok(())
}

#[tauri::command]
pub fn get_seed_torrents_enabled(app: AppHandle) -> Result<bool, String> {
  let conn = open_database_connection(&app)?;
  let value = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = 'seed_torrents_enabled'",
      [],
      |row| row.get::<_, String>(0),
    )
    .ok();

  Ok(!matches!(value.as_deref(), Some("0") | Some("false") | Some("FALSE")))
}
