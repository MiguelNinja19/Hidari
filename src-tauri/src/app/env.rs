/// Carrega `.env` na raiz do projeto (dev: `npm run tauri:dev`).
pub fn load_env_from_cwd() {
  let _ = dotenvy::dotenv();
}

/// Fallback: `%APPDATA%/.../config/.env` se a variável ainda não estiver definida.
pub fn load_env_from_app_config(app: &tauri::AppHandle) {
  let has_steam_web = std::env::var(crate::config::STEAM_WEB_API_KEY_ENV)
    .map(|value| !value.trim().is_empty())
    .unwrap_or(false);
  if has_steam_web {
    return;
  }
  if let Ok(dir) = app.path().app_config_dir() {
    let path = dir.join(".env");
    if path.is_file() {
      let _ = dotenvy::from_path(&path);
    }
  }
}

use tauri::Manager;
