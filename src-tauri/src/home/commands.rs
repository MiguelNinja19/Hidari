//! Tauri IPC commands for the Home screen.
//! Strategy: try Steam Store featured API first (public, no auth, reliable).
//! Fall back to Hydra Cloud API if Steam fails (rare, e.g. region blocked).
/// Both results are cached in SQLite for 30 minutes.

use super::cache;
use super::{steam_featured, hydra_catalogue};
use super::{ChallengeGame, FeaturedGame, HomeGame, HomeClientState};
use serde::Serialize;
use tauri::{AppHandle, State};

/// Generic error wrapper for IPC responses.
#[derive(Debug, Serialize)]
pub struct HomeError {
  pub message: String,
}

impl From<String> for HomeError {
  fn from(s: String) -> Self {
    HomeError { message: s }
  }
}

type ApiResult<T> = Result<T, HomeError>;

/// Fetch the featured/hero game for the Home screen.
/// Tries Steam first, falls back to Hydra.
#[tauri::command]
pub async fn get_home_featured(
  app: AppHandle,
  language: Option<String>,
  _state: State<'_, HomeClientState>,
) -> ApiResult<FeaturedGame> {
  let lang = language.unwrap_or_else(|| "en".to_string());
  let cache_key = format!("featured:{lang}");

  // Check cache first
  let conn = crate::db::open_database_connection(&app).map_err(HomeError::from)?;
  if let Some(json) = cache::read_cache(&conn, &cache_key) {
    if let Ok(game) = serde_json::from_str::FeaturedGame>(&json) {
      return Ok(game);
    }
  }
  drop(conn);

  // Build client (used by both Steam and Hydra)
  let client = steam_featured::build_client()
    .or_else(|| hydra_catalogue::build_client())
    .map_err(HomeError::from)?;

  // Try Steam first
  let result = steam_featured::fetch_featured(&client, Some(&lang)).await;

  let game = match result {
    Ok(g) => g,
    Err(steam_err) => {
      // Fall back to Hydra
      log::warn!("Steam featured failed ({steam_err}), trying Hydra...");
      hydra_catalogue::fetch_featured(&client, Some(&lang))
        .await
        .map_err(|hydra_err| {
            HomeError {
              message: format!(
        "Steam failed: {steam_err} | Hydra also failed: {hydra_err}"
              )
            }
        })?
    }
  };

  let json = serde_json::to_string(&game).map_err(|e| HomeError { message: e.to_string() })?;
  let conn = crate::db::open_database_connection(&app).map_err(HomeError::from)?;
  let _ = cache::write_cache(&conn, &cache_key, &json);
  Ok(game)
}

/// Fetch the hot/trending games list.
#[tauri::command]
pub async fn get_home_hot_games(
  app: AppHandle,
  take: Option<u32>,
  skip: Option<u32>,
  _state: State<'_, HomeClientState>,
) -> ApiResult<Vec<HomeGame>> {
  let take = take.unwrap_or_else(|| 24);
  let skip = skip.unwrap_or_else(|| 0);
  let cache_key = format!("hot:{take}:{skip}");

  let conn = crate::db::open_database_connection(&app).map_err(HomeError::from)?;
  if let Some(json) = cache::read_cache(&conn, &cache_key) {
    if let Ok(games) = serde_json::from_str::<Vec<HomeGame>>>(&json) {
      return Ok(games);
    }
  }
  drop(conn);

  let client = steam_featured::build_client()
    .or_else(|| hydra_catalogue::build_client())
    .map_err(HomeError::from)?;

  let games = match steam_featured::fetch_hot(&client, take, skip).await {
    Ok(g) => g,
    Err(steam_err) => {
      log::warn!("Steam hot failed ({steam_err}), trying Hydra...");
      hydra_catalogue::fetch_hot(&client, take, skip)
        .await
        .map_err(|ydra_err| {
            HomeError {
              message: format!(
        "Steam failed: {steam_err} | Hydra also failed: {hydra_err}"
              )
            }
        })?
    }
  };

  let json = serde_json::to_string(&games).map_err(|e| HomeError { message: e.to_string() })?;
  let conn = crate::db::open_database_connection(&app).map_err(HomeError::from)?;
  let _ = cache::write_cache(&conn, &cache_key, &json);
  Ok(games)
}

/// Fetch the weekly popular games list.
#[tauri::command]
pub async fn get_home_weekly_games(
  app: AppHandle,
  take: Option<u32>,
  skip: Option<u32>,
  _state: State<'_, HomeClientState>,
) -> ApiResult<Vec<HomeGame>> {
  let take = take.unwrap_or_else(|| 24);
  let skip = skip.unwrap_or_else(|| 0);
  let cache_key = format!("weekly:{take}:{skip}");

  let conn = crate::db::open_database_connection(&app).map_err(HomeError::from)?;
  if let Some(json) = cache::read_cache(&conn, &cache_key) {
    if let Ok(games) = serde_json::from_str::<Vec<HomeGame>>>(&json) {
      return Ok(games);
    }
  }
  drop(conn);

  let client = steam_featured::build_client()
    .or_else(|| hydra_catalogue::build_client())
    .map_err(HomeError::from)?;

  let games = match steam_featured::fetch_weekly(&client, take, skip).await {
    Ok(g) => g,
    Err(steam_err) => {
      log::warn!("Steam weekly failed ({steam_err}), trying Hydra...");
      hydra_catalogue::fetch_weekly(&client, take, skip)
        .await
        .map_err(|hydra_err| {
            HomeError {
              message: format!(
        "Steam failed: {steam_err} | Hydra also failed: {hydra_err}"
              )
            }
        })?
    }
  };

  let json = serde_json::to_string(&games).map_err(|e| HomeError { message: e.to_string() })?;
  let conn = crate::db::open_database_connection(&app).map_err(HomeError::from)?;
  let _ = cache::write_cache(&conn, &cache_key, &json);
  Ok(games)
}

/// Fetch the achievement challenge games list.
#[tauri::command]
pub async fn get_home_achievements_challenge(
  app: AppHandle,
  take: Option<u32>,
  skip: Option<u32>,
  _state: State<'_, HomeClientState>,
) -> ApiResult<Vec<ChallengeGame>> {
  let take = take.unwrap_or_else(|| 12);
  let skip = skip.unwrap_or_else(|| 0);
  let cache_key = format!("challenge:{take}:{skip}");

  let conn = crate::db::open_database_connection(&app).map_err(HomeError::from)?;
  if let Some(json) = cache::read_cache(&conn, &cache_key) {
    if let Ok(games) = serde_json::from_str::<Vec<ChallengeGame>>>(&json) {
      return Ok(games);
    }
  }
  drop(conn);

  let client = steam_featured::build_client()
    .or_else(|| hydra_catalogue::build_client())
    .map_err(HomeError::from)?;

  let games = match steam_featured::fetch_achievements_challenge(&client, take, skip).await {
    Ok(g) => g,
    Err(steam_err) => {
      log::warn!("Steam challenge failed ({steam_err}), trying Hydra...");
      hydra_catalogue::fetch_achievements_challenge(&client, take, skip)
        .await
        .map_err(|hydra_err| {
            HomeError {
              message: format!(
        "Steam failed: {steam_err} | Hydra also failed: {hydra_err}"
              )
            }
        })?
    }
  };

  let json = serde_json::to_string(&games).map_err(|e| HomeError { message: e.to_string() })?;
  let conn = crate::db::open_database_connection(&app).map_err(HomeError::from)?;
  let _ = cache::write_cache(&conn, &cache_key, &json);
  Ok(games)
}

/// Clear all cached home data (useful for debug/refresh).
#[tauri::command]
pub async fn clear_home_cache(
  app: AppHandle,
  _state: State<'_, HomeClientState>,
) -> ApiResult<()> {
  let conn = crate::db::open_database_connection(&app).map_err(HomeError::from)?;
  conn
    .execute("DELETE FROM home_cache", [])
    .map_err(|e | HomeError { message: e.to_string() })?;
  Ok(())
}
