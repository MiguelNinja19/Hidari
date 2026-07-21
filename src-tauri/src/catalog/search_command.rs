use super::{
  fetch_steam_catalog_games, filter_embedded_catalog, search_catalog_from_sources,
  steam_cache_get, steam_cache_put,
};
use crate::db::open_database_connection;
use crate::dto::{CatalogGameDto, SearchCatalogPayload};
use std::collections::HashSet;
use tauri::AppHandle;

#[tauri::command]
pub async fn search_game_catalog(
  app: AppHandle,
  payload: SearchCatalogPayload,
) -> Result<Vec<CatalogGameDto>, String> {
  let trimmed = payload.query.trim();
  let query_norm = trimmed.to_lowercase();
  let offset = payload.offset.unwrap_or(0);
  let limit = payload.limit.unwrap_or(24).clamp(1, 56);
  if query_norm.len() < 2 {
    return Ok(Vec::new());
  }
  if payload.only_with_sources.unwrap_or(false) {
    return search_catalog_from_sources(
      &app,
      trimmed,
      offset,
      limit,
      payload.attach_covers.unwrap_or(false),
      payload.local_only.unwrap_or(false),
    )
    .await;
  }
  let mut merged = filter_embedded_catalog(&query_norm);
  let mut seen: HashSet<String> = merged
    .iter()
    .map(|game| game.title.to_lowercase())
    .collect();
  let conn = open_database_connection(&app)?;
  let offline = crate::db::read_app_setting_bool(&conn, "offline_mode", false);
  if !payload.include_steam.unwrap_or(true) || offline {
    return Ok(merged.into_iter().take(56).collect());
  }
  let steam_chunk = if let Some(cached) = steam_cache_get(&conn, &query_norm) {
    cached
  } else {
    drop(conn);
    let fetched = fetch_steam_catalog_games(trimmed).await.unwrap_or_default();
    if !fetched.is_empty() {
      if let Ok(conn) = open_database_connection(&app) {
        let _ = steam_cache_put(&conn, &query_norm, &fetched);
      }
    }
    fetched
  };
  for game in steam_chunk {
    if seen.insert(game.title.to_lowercase()) {
      merged.push(game);
    }
    if merged.len() >= 56 {
      break;
    }
  }
  Ok(merged.into_iter().skip(offset).take(limit).collect())
}
