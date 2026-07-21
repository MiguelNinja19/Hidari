use crate::catalog::steam_details::SteamGameDetails;
use crate::db::open_database_connection;
use crate::dto::CatalogGameDto;
use tauri::AppHandle;

pub(crate) fn apply_genre_from_steam_or_cache(
  app: &AppHandle,
  game: &mut CatalogGameDto,
  steam: &Option<SteamGameDetails>,
) {
  if let Some(details) = steam.as_ref() {
    if !details.genres.is_empty() {
      game.genre = details.genres.join(", ");
    }
  }

  if super::super::looks_like_source_label(&game.genre) {
    if let Ok(conn) = open_database_connection(app) {
      if let Some(genres) =
        crate::catalog::steam_details::cached_genres_for_title(&conn, &game.title)
      {
        if !genres.is_empty() {
          game.genre = genres.join(", ");
        } else {
          game.genre.clear();
        }
      } else {
        game.genre.clear();
      }
    } else {
      game.genre.clear();
    }
  }
}

pub(crate) fn attach_cover_urls(app: &AppHandle, game: &mut CatalogGameDto) {
  crate::covers::attach_cover_urls_to_games(app, std::slice::from_mut(game));
}

pub(crate) fn fill_missing_cover(
  app: &AppHandle,
  game: &mut CatalogGameDto,
  steam: &Option<SteamGameDetails>,
  steam_app_id: Option<u32>,
) {
  let needs_cover = game
    .cover_url
    .as_ref()
    .map(|url| url.trim().is_empty())
    .unwrap_or(true);
  if !needs_cover {
    return;
  }

  if let Some(app_id) = steam_app_id {
    let url = crate::catalog::steam_grid_cover(app_id);
    game.cover_url = Some(url.clone());
    if let Ok(conn) = open_database_connection(app) {
      let _ = crate::covers::upsert_game_cover_if_absent(&conn, &game.title, &url);
    }
    return;
  }

  let Some(details) = steam.as_ref() else {
    return;
  };
  let fallback = details
    .header_image
    .as_ref()
    .map(|url| url.trim())
    .filter(|url| !url.is_empty())
    .map(|url| url.to_string())
    .or_else(|| {
      details
        .screenshots
        .iter()
        .map(|url| url.trim())
        .find(|url| !url.is_empty())
        .map(|url| url.to_string())
    });
  let Some(url) = fallback else {
    return;
  };
  let url = crate::covers::cover_download_urls(&url)
    .into_iter()
    .find(|candidate| candidate.contains("library_600x900"))
    .unwrap_or(url);
  game.cover_url = Some(url.clone());
  if let Ok(conn) = open_database_connection(app) {
    let _ = crate::covers::upsert_game_cover_if_absent(&conn, &game.title, &url);
  }
}
