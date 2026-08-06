//! Tauri IPC commands for achievements.

use super::cracker_paths::get_paths_for_cracker;
use super::memory_store::AchievementMemoryStore;
use super::parsers::parse_achievement_file;
use super::{AchievementData, Cracker, ScanAchievementsResult, UnlockedAchievement};
use serde::Serialize;
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct AchievementError {
  pub message: String,
}

type ApiResult<T> = Result<T, AchievementError>;

/// Scan all cracker save file locations for a given game's unlocked achievements.
///
/// Tries all 12+ cracker formats. Returns the first non-empty result found
/// (in priority order: Goldberg  Codex  Rune  others). The full list of
/// scanned paths is returned for debugging.
#[tauri::command]
pub async fn scan_game_achievements(
  shop: String,
  object_id: String,
  steam_path: Option<String>,
  wine_prefix: Option<String>,
  store: State<'_, AchievementMemoryStore>,
) -> ApiResult<ScanAchievementsResult> {
  let steam_path_ref = steam_path.as_ref().map(PathBuf::from);
  let wine_prefix_ref = wine_prefix.as_ref().map(PathBuf::from);
  let steam_path_arg = steam_path_ref.as_deref();
  let wine_prefix_arg = wine_prefix_ref.as_deref();

  let mut scanned_paths = Vec::new();
  let mut best_result: Option<(Vec<UnlockedAchievement>, String)> = None;

  for cracker in Cracker::all() {
    let paths = get_paths_for_cracker(
      *cracker,
      &object_id,
      steam_path_arg,
      wine_prefix_arg,
    );
    for p in paths {
      let exists = p.exists();
      scanned_paths.push(format!(
        "{}: {} {}",
        cracker.label(),
        p.display(),
        if exists { "(exists)" } else { "" }
      ));
      if exists {
        let unlocked = parse_achievement_file(&p, *cracker);
        if !unlocked.is_empty() {
          // Prefer this result if it's the first non-empty or has more unlocks
          if let Some((existing, _)) = &best_result {
            if unlocked.len() > existing.len() {
              best_result = Some((unlocked, cracker.label().to_string()));
            }
          } else {
            best_result = Some((unlocked, cracker.label().to_string()));
          }
        }
      }
    }
  }

  let (unlocked, source_str) = best_result.unwrap_or_default();
  // Convert empty string to None (no cracker found)
  let source = if source_str.is_empty() { None } else { Some(source_str) };

  let data = AchievementData {
    unlocked: unlocked.clone(),
    source: source.clone(),
    ..Default::default()
  };
  store.set(&shop, &object_id, data);

  Ok(ScanAchievementsResult {
    object_id,
    shop,
    unlocked,
    source,
    scanned_paths,
  })
}

/// Get cached achievement data for a game (from memory store).
/// Triggers a scan if not cached yet.
#[tauri::command]
pub async fn get_unlocked_achievements(
  shop: String,
  object_id: String,
  steam_path: Option<String>,
  wine_prefix: Option<String>,
  store: State<'_, AchievementMemoryStore>,
) -> ApiResult<ScanAchievementsResult> {
  if let Some(data) = store.get(&shop, &object_id) {
    if !data.unlocked.is_empty() || data.source.is_some() {
      return Ok(ScanAchievementsResult {
        object_id,
        shop,
        unlocked: data.unlocked,
        source: data.source,
        scanned_paths: Vec::new(),
      });
    }
  }
  // Otherwise scan
  scan_game_achievements(shop, object_id, steam_path, wine_prefix, store).await
}

/// Clear all cached achievement data (for debug).
#[tauri::command]
pub async fn clear_achievements_cache(
  store: State<'_, AchievementMemoryStore>,
) -> ApiResult<()> {
  store.clear();
  Ok(())
}
