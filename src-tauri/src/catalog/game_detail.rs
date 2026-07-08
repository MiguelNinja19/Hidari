use crate::catalog::steam_details::{cached_genres_for_title, resolve_steam_details_for_app};
use crate::catalog::{normalize_match_text, stable_embedded_id};
use crate::db::{get_disabled_hydra_source_ids_from_conn, open_database_connection};
use crate::dto::{CatalogGameDto, DownloadOptionDto, GameDetailDto, GetGameDetailPayload};
use crate::sources::{list_hydra_sources, search_download_options_from_local_sources};
use rusqlite::params;
use tauri::AppHandle;

fn find_catalog_game_by_group_key(
  conn: &rusqlite::Connection,
  group_key: &str,
) -> Option<CatalogGameDto> {
  let row: (String, String, i64) = conn
    .query_row(
      "SELECT hce.group_key, MAX(hce.display_title), COUNT(*) \
       FROM hydra_catalog_entries hce \
       WHERE hce.group_key = ?1 \
       GROUP BY hce.group_key",
      params![group_key],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .ok()?;
  let source_name: String = conn
    .query_row(
      "SELECT hds.name FROM hydra_catalog_entries hce \
       JOIN hydra_download_sources hds ON hds.id = hce.source_id \
       WHERE hce.group_key = ?1 LIMIT 1",
      params![group_key],
      |row| row.get(0),
    )
    .unwrap_or_else(|_| "Catálogo".to_string());

  Some(CatalogGameDto {
    id: format!("source:{}", stable_embedded_id(&row.0)),
    title: row.1,
    genre: source_name,
    cover_url: None,
    local_cover_path: None,
    source: "source".to_string(),
    option_count: (row.2 > 1).then_some(row.2 as u32),
  })
}

fn find_catalog_game_by_title(conn: &rusqlite::Connection, title: &str) -> Option<CatalogGameDto> {
  let norm = normalize_match_text(title);
  if norm.is_empty() {
    return None;
  }
  let group_key: String = conn
    .query_row(
      "SELECT group_key FROM hydra_catalog_entries \
       WHERE title_norm LIKE ?1 || '%' OR display_title LIKE ?2 || '%' \
       ORDER BY LENGTH(title_norm) ASC LIMIT 1",
      params![norm, norm],
      |row| row.get(0),
    )
    .ok()?;
  find_catalog_game_by_group_key(conn, &group_key)
}

#[tauri::command]
pub async fn get_game_detail(
  app: AppHandle,
  payload: GetGameDetailPayload,
) -> Result<GameDetailDto, String> {
  let conn = open_database_connection(&app)?;
  let game = if let Some(group_key) = payload.group_key.filter(|v| !v.trim().is_empty()) {
    find_catalog_game_by_group_key(&conn, group_key.trim())
  } else if let Some(title) = payload.title.filter(|v| !v.trim().is_empty()) {
    find_catalog_game_by_title(&conn, title.trim())
  } else {
    None
  }
  .ok_or_else(|| "Jogo não encontrado no catálogo.".to_string())?;

  let hydra_sources = list_hydra_sources(&conn)?;
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn)?;
  drop(conn);

  let active_sources: Vec<_> = hydra_sources
    .into_iter()
    .filter(|s| !disabled.contains(&s.id))
    .collect();

  let downloads: Vec<DownloadOptionDto> =
    search_download_options_from_local_sources(&app, &game.title, &active_sources).await;

  let steam = resolve_steam_details_for_app(&app, &game.title).await;
  let steam_app_id = steam.as_ref().map(|s| s.app_id);
  let synopsis = steam.as_ref().and_then(|s| s.synopsis.clone());
  let screenshots = steam.as_ref().map(|s| s.screenshots.clone()).unwrap_or_default();
  let trailer_url = steam.as_ref().and_then(|s| s.trailer_url.clone());
  let trailer_thumbnail = steam.as_ref().and_then(|s| s.trailer_thumbnail.clone());

  let mut game_with_cover = game;
  if let Some(details) = steam.as_ref() {
    if !details.genres.is_empty() {
      game_with_cover.genre = details.genres.join(", ");
    }
  }

  if super::looks_like_source_label(&game_with_cover.genre) {
    if let Ok(conn) = open_database_connection(&app) {
      if let Some(genres) = cached_genres_for_title(&conn, &game_with_cover.title) {
        if !genres.is_empty() {
          game_with_cover.genre = genres.join(", ");
        } else {
          game_with_cover.genre.clear();
        }
      } else {
        game_with_cover.genre.clear();
      }
    } else {
      game_with_cover.genre.clear();
    }
  }

  crate::covers::attach_cover_urls_to_games(&app, std::slice::from_mut(&mut game_with_cover));

  Ok(GameDetailDto {
    game: game_with_cover,
    synopsis,
    screenshots,
    trailer_url,
    trailer_thumbnail,
    steam_app_id,
    downloads,
    in_library: false,
  })
}
