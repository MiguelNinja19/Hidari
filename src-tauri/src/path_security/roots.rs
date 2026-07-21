use crate::db::{get_default_download_path, open_database_connection};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn listed_library_game_roots(app: &AppHandle) -> Vec<PathBuf> {
  let Ok(conn) = open_database_connection(app) else {
    return Vec::new();
  };
  let Ok(mut stmt) = conn.prepare("SELECT game_root FROM library_game_roots") else {
    return Vec::new();
  };
  stmt
    .query_map([], |row| row.get::<_, String>(0))
    .ok()
    .into_iter()
    .flatten()
    .filter_map(|result| result.ok())
    .map(PathBuf::from)
    .filter(|path| path.is_absolute())
    .collect()
}

pub(crate) fn app_managed_roots(app: &AppHandle) -> Vec<PathBuf> {
  let mut roots = Vec::new();
  if let Ok(Some(download)) = get_default_download_path(app) {
    let path = PathBuf::from(download.trim());
    if path.is_absolute() {
      roots.push(path);
    }
  }
  roots.extend(listed_library_game_roots(app));
  if let Ok(data) = app.path().app_data_dir() {
    roots.push(data);
  }
  if let Ok(cache) = app.path().app_cache_dir() {
    roots.push(cache);
  }
  if let Ok(config) = app.path().app_config_dir() {
    roots.push(config);
  }
  roots
}
