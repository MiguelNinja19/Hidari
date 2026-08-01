//! Tauri IPC commands for the Home screen.

use super::cache;
use super::hydra_catalogue;
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
/// Uses 30-minute cache to reduce Hydra API load.
#[tauri::command]
pub async fn get_home_featured(
  app: AppHandle,
  language: Option<String>,
  _state: State<'_, HomeClientState>,
) -> ApiResult<FeaturedGame> {
  let lang = language.unwrap_or_else(|| "en".to_string());
  let cache_key = format!("featured:{lang}");

  let conn = crate::db::pool::open_database_connection(&app).map_err(HomeError::from)?;
  if let Some(json) = cache::read_cache(&conn, &cache_key) {
    if let Ok(game) = serde_json::from_str::<FeaturedGame>(&json) {
      return Ok(game);
    }
  }
  drop(conn);

  let client = hydra_catalogue::build_client()?;
  let game = hydra_catalogue::fetch_featured(&client, Some(&lang)).await?;
  let json = serde_json::to_string(&game).map_err(|e| HomeError { message: e.to_string() })?;

  let conn = crate::db::pool::open_database_connection(&app).map_err(HomeError::from)?;
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
  let take = take.unwrap_or(24);
  let skip = skip.unwrap_or(0);
  let cache_key = format!("hot:{take}:{skip}");

  let conn = crate::db::pool::open_database_connection(&app).map_err(HomeError::from)?;
  if let Some(json) = cache::read_cache(&conn, &cache_key) {
    if let Ok(games) = serde_json::from_str::<Vec<HomeGame>>(&json) {
      return Ok(games);
    }
  }
  drop(conn);

  let client = hydra_catalogue::build_client()?;
  let games = hydra_catalogue::fetch_hot(&client, take, skip).await?;
  let json = serde_json::to_string(&games).map_err(|e| HomeError { message: e.to_string() })?;

  let conn = crate::db::pool::open_database_connection(&app).map_err(HomeError::from)?;
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
  let take = take.unwrap_or(24);
  let skip = skip.unwrap_or(0);
  let cache_key = format!("weekly:{take}:{skip}");

  let conn = crate::db::pool::open_database_connection(&app).map_err(HomeError::from)?;
  if let Some(json) = cache::read_cache(&conn, &cache_key) {
    if let Ok(games) = serde_json::from_str::<Vec<HomeGame>>(&json) {
      return Ok(games);
    }
  }
  drop(conn);

  let client = hydra_catalogue::build_client()?;
  let games = hydra_catalogue::fetch_weekly(&client, take, skip).await?;
  let json = serde_json::to_string(&games).map_err(|e| HomeError { message: e.to_string() })?;

  let conn = crate::db::pool::open_database_connection(&app).map_err(HomeError::from)?;
  let _ = cache::write_cache(&conn, &cache_key, &json);
  Ok(games)
}

/// Fetch the achievement challenge games list (hard platinums).
#[tauri::command]
pub async fn get_home_achievements_challenge(
  app: AppHandle,
  take: Option<u32>,
  skip: Option<u32>,
  _state: State<'_, HomeClientState>,
) -> ApiResult<Vec<ChallengeGame>> {
  let take = take.unwrap_or(12);
  let skip = skip.unwrap_or(0);
  let cache_key = format!("challenge:{take}:{skip}");

  let conn = crate::db::pool::open_database_connection(&app).map_err(HomeError::from)?;
  if let Some(json) = cache::read_cache(&conn, &cache_key) {
    if let Ok(games) = serde_json::from_str::<Vec<ChallengeGame>>(&json) {
      return Ok(games);
    }
  }
  drop(conn);

  let client = hydra_catalogue::build_client()?;
  let games = hydra_catalogue::fetch_achievements_challenge(&client, take, skip).await?;
  let json = serde_json::to_string(&games).map_err(|e| HomeError { message: e.to_string() })?;

  let conn = crate::db::pool::open_database_connection(&app).map_err(HomeError::from)?;
  let _ = cache::write_cache(&conn, &cache_key, &json);
  Ok(games)
}

/// Clear all cached home data (useful for debug/refresh).
#[tauri::command]
pub async fn clear_home_cache(
  app: AppHandle,
  _state: State<'_, HomeClientState>,
) -> ApiResult<()> {
  let conn = crate::db::pool::open_database_connection(&app).map_err(HomeError::from)?;
  conn
    .execute("DELETE FROM home_cache", [])
    .map_err(|e| HomeError { message: e.to_string() })?;
  Ok(())
}
