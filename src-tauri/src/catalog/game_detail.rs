use crate::catalog::steam_details::{cached_genres_for_title, resolve_steam_details_for_app};
use crate::catalog::{normalize_match_text, stable_embedded_id};
use crate::db::{get_disabled_hydra_source_ids_from_conn, open_database_connection};
use crate::dto::{CatalogGameDto, DownloadOptionDto, GameDetailDto, GetGameDetailPayload};
use crate::sources::{list_download_options_for_group_key, list_hydra_sources, search_download_options_from_local_sources};
use crate::title::catalog_game_display_title_from_group_key;
use rusqlite::params;
use tauri::AppHandle;

fn find_catalog_game_by_group_key(
  conn: &rusqlite::Connection,
  group_key: &str,
) -> Option<CatalogGameDto> {
  let row: (i64,) = conn
    .query_row(
      "SELECT COUNT(*) \
       FROM hydra_catalog_entries hce \
       WHERE hce.group_key = ?1",
      params![group_key],
      |row| Ok((row.get(0)?,)),
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
    id: format!("source:{}", stable_embedded_id(group_key)),
    title: catalog_game_display_title_from_group_key(group_key),
    genre: source_name,
    cover_url: None,
    local_cover_path: None,
    source: "source".to_string(),
    option_count: (row.0 > 1).then_some(row.0 as u32),
    group_key: Some(group_key.to_string()),
  })
}

fn find_catalog_game_by_title(conn: &rusqlite::Connection, title: &str) -> Option<CatalogGameDto> {
  let trimmed = title.trim();
  if trimmed.is_empty() {
    return None;
  }

  if let Ok(group_key) = conn.query_row(
    "SELECT group_key FROM hydra_catalog_entries \
     WHERE group_key != '' AND display_title = ?1 \
     LIMIT 1",
    params![trimmed],
    |row| row.get::<_, String>(0),
  ) {
    if let Some(game) = find_catalog_game_by_group_key(conn, &group_key) {
      return Some(game);
    }
  }

  let norm = normalize_match_text(trimmed);
  if norm.is_empty() {
    return None;
  }
  let group_key: String = conn
    .query_row(
      "SELECT group_key FROM hydra_catalog_entries \
       WHERE group_key != '' AND (title_norm LIKE ?1 || '%' OR display_title LIKE ?2 || '%') \
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
  let payload_group_key = payload
    .group_key
    .as_ref()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());
  let payload_title = payload
    .title
    .as_ref()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());

  let game = if let Some(group_key) = payload_group_key.as_deref() {
    find_catalog_game_by_group_key(&conn, group_key)
  } else if let Some(title) = payload_title.as_deref() {
    find_catalog_game_by_title(&conn, title)
  } else {
    None
  }
  .ok_or_else(|| "Jogo não encontrado no catálogo.".to_string())?;

  let hydra_sources = list_hydra_sources(&conn)?;
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn)?;
  let resolved_group_key = payload_group_key.or_else(|| game.group_key.clone());

  let active_sources: Vec<_> = hydra_sources
    .into_iter()
    .filter(|s| !disabled.contains(&s.id))
    .collect();

  let downloads = if let Some(group_key) = resolved_group_key {
    let mut options = list_download_options_for_group_key(&conn, &active_sources, &group_key);
    drop(conn);
    if options.is_empty() {
      search_download_options_from_local_sources(&app, &game.title, &active_sources).await
    } else {
      options
    }
  } else {
    drop(conn);
    search_download_options_from_local_sources(&app, &game.title, &active_sources).await
  };

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
