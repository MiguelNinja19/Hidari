//! Tauri IPC commands for Steam integration.

use super::scan::{detect_steam_install, scan_steam_library};
use super::{ImportResult, ScanResult, SteamInstall};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
pub struct SteamError {
  pub message: String,
}

impl From<String> for SteamError {
  fn from(s: String) -> Self {
    SteamError { message: s }
  }
}

type ApiResult<T> = Result<T, SteamError>;

/// Detect Steam installation (path, user IDs, library folders).
/// Returns null (Ok(None)) if Steam is not installed.
#[tauri::command]
pub async fn detect_steam_install_command() -> ApiResult<Option<SteamInstall>> {
  Ok(detect_steam_install())
}

/// Scan all Steam library folders for installed games.
/// Returns manifests for every installed game found.
#[tauri::command]
pub async fn scan_steam_library_command() -> ApiResult<Option<ScanResult>> {
  let install = match detect_steam_install() {
    Some(i) => i,
    None => return Ok(None),
  };
  let result = scan_steam_library(&install);
  Ok(Some(result))
}

/// Import scanned Steam games into the Hidari library.
/// Each game is added to `library_game_roots` table with `library_key = steam:<appid>`.
/// Games that are already in the library are skipped (deduped by library_key).
#[tauri::command]
pub async fn import_steam_games_to_library(
  app: AppHandle,
  manifests: Vec<super::AppManifest>,
) -> ApiResult<ImportResult> {
  let conn = crate::db::open_database_connection(&app).map_err(SteamError::from)?;
  let mut imported = 0usize;
  let mut skipped = 0usize;
  let mut errors = Vec::new();

  for m in &manifests {
    let library_key = format!("steam:{}", m.appid);
    // Check if already exists
    let exists: bool = conn
      .query_row(
        "SELECT 1 FROM library_game_roots WHERE library_key = ?1",
        rusqlite::params![library_key],
        |_| Ok(true),
      )
      .unwrap_or(false);
    if exists {
      skipped += 1;
      continue;
    }
    // Insert
    if let Err(e) = conn.execute(
      "INSERT OR REPLACE INTO library_game_roots (library_key, title, dest_path, game_root, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)",
      rusqlite::params![
        library_key,
        m.name,
        m.install_path,
        m.install_path,
        chrono::Utc::now().to_rfc3339(),
      ],
    ) {
      errors.push(format!("{}: {}", m.name, e));
      continue;
    }
    imported += 1;
  }

  Ok(ImportResult {
    imported_count: imported,
    skipped_count: skipped,
    errors,
  })
}

/// Get the list of Steam user IDs (for shortcuts.vdf access later).
#[tauri::command]
pub async fn get_steam_users() -> ApiResult<Vec<String>> {
  let install = match detect_steam_install() {
    Some(i) => i,
    None => return Ok(Vec::new()),
  };
  Ok(install.user_ids)
}
