use crate::db::{open_database_connection, validate_app_setting_key};
use crate::dto::*;
use rusqlite::params;
use rusqlite::OptionalExtension;
use std::path::Path;
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

/// Espaço livre no volume que contém o caminho (bytes). Útil para mostrar no UI de pastas.
#[tauri::command]
pub fn get_disk_free_bytes_for_path(
  payload: DiskPathPayload,
) -> Result<Option<u64>, String> {
  use sysinfo::Disks;

  let path_arg = payload.path.trim();
  if path_arg.is_empty() {
    return Ok(None);
  }
  let path = Path::new(path_arg);
  if path == Path::new("") {
    return Ok(None);
  }
  let candidate = if path.exists() {
    path
      .canonicalize()
      .map_err(|e| format!("disk_path_error: {e}"))?
  } else {
    // Pasta ainda não criada: usa o root do caminho inserido
    // (ex. "D:\Games" → tenta achar o disco "D:\").
    let mut p = path.to_path_buf();
    if !p.has_root() {
      return Ok(None);
    }
    while p.parent().is_some() && !p.as_path().exists() {
      if let Some(parent) = p.parent() {
        p = parent.to_path_buf();
      } else {
        break;
      }
    }
    p
  };

  let s = candidate.to_string_lossy().to_string();
  #[cfg(windows)]
  let s_norm: String = s.to_lowercase();
  #[cfg(not(windows))]
  let s_norm = s;

  let disks = Disks::new_with_refreshed_list();
  let mut best: Option<(usize, u64)> = None;
  for disk in disks.list() {
    let m = disk.mount_point().to_string_lossy();
    #[cfg(windows)]
    let m_norm: String = m.to_lowercase();
    #[cfg(not(windows))]
    let m_norm: String = m.to_string();
    if s_norm.starts_with(m_norm.as_str()) {
      let len = m_norm.len();
      if best.map_or(true, |(best_len, _)| len > best_len) {
        best = Some((len, disk.available_space()));
      }
    }
  }
  Ok(best.map(|(_, space)| space))
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
  let trimmed = url.trim();
  if trimmed.is_empty() {
    return Err("empty_url".to_string());
  }
  let parsed = url::Url::parse(trimmed).map_err(|error| format!("invalid_url: {error}"))?;
  match parsed.scheme() {
    "http" | "https" => {}
    other => return Err(format!("unsupported_url_scheme: {other}")),
  }
  open::that(trimmed).map_err(|error| format!("could_not_open_url: {error}"))
}
