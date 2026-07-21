use super::cover::{apply_genre_from_steam_or_cache, attach_cover_urls, fill_missing_cover};
use super::downloads::resolve_downloads;
use super::find_by_key::find_catalog_game_by_group_key;
use super::find_by_title::find_catalog_game_by_title;
use crate::catalog::steam_details::{resolve_steam_details_for_app, SteamGameDetails};
use crate::db::{get_disabled_hydra_source_ids_from_conn, open_database_connection};
use crate::dto::{CatalogGameDto, GameDetailDto, GetGameDetailPayload};
use crate::sources::list_hydra_sources;
use tauri::AppHandle;

fn steam_only_game(title: &str, steam: &SteamGameDetails) -> CatalogGameDto {
  CatalogGameDto {
    id: format!("steam:{}", steam.app_id),
    title: title.to_string(),
    genre: steam.genres.join(", "),
    cover_url: None,
    local_cover_path: None,
    source: "steam".to_string(),
    option_count: Some(0),
    group_key: Some(format!("steam:{}", steam.app_id)),
  }
}

fn detail_from_steam(
  app: &AppHandle,
  title: &str,
  steam: SteamGameDetails,
) -> GameDetailDto {
  let steam_app_id = Some(steam.app_id);
  let synopsis = steam.synopsis.clone();
  let screenshots = steam.screenshots.clone();
  let trailer_url = steam.trailer_url.clone();
  let trailer_thumbnail = steam.trailer_thumbnail.clone();
  let mut game = steam_only_game(title, &steam);
  let steam_opt = Some(steam);
  apply_genre_from_steam_or_cache(app, &mut game, &steam_opt);
  attach_cover_urls(app, &mut game);
  fill_missing_cover(app, &mut game, &steam_opt, steam_app_id);
  GameDetailDto {
    game,
    synopsis,
    screenshots,
    trailer_url,
    trailer_thumbnail,
    steam_app_id,
    downloads: Vec::new(),
    in_library: false,
  }
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
    .filter(|value| {
      let lower = value.to_ascii_lowercase();
      !value.is_empty()
        && !lower.starts_with("source:")
        && !(lower.starts_with("emb_") && !value.contains(' '))
    });
  let payload_title = payload
    .title
    .as_ref()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());

  let hydra_sources = list_hydra_sources(&conn)?;
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn)?;
  let active_sources: Vec<_> = hydra_sources
    .into_iter()
    .filter(|s| !disabled.contains(&s.id))
    .collect();
  drop(conn);

  let catalog_game = if let Some(group_key) = payload_group_key.as_deref() {
    find_catalog_game_by_group_key(&app, &active_sources, group_key).or_else(|| {
      payload_title
        .as_deref()
        .and_then(|title| find_catalog_game_by_title(&app, &active_sources, title))
    })
  } else if let Some(title) = payload_title.as_deref() {
    find_catalog_game_by_title(&app, &active_sources, title)
  } else {
    None
  };

  let include_steam = payload.include_steam.unwrap_or(false);
  let language = payload.language.as_deref();

  // Jogos externos (Steam/.exe) têm capa via índice Steam, mas podem não estar no catálogo Hydra.
  // Sem este fallback, «Ver detalhes» falhava apesar da capa existir.
  let Some(game) = catalog_game else {
    let title = payload_title
      .ok_or_else(|| "Jogo não encontrado no catálogo.".to_string())?;
    if !include_steam {
      return Err("Jogo não encontrado no catálogo.".to_string());
    }
    let steam = resolve_steam_details_for_app(&app, &title, language)
      .await
      .ok_or_else(|| "Jogo não encontrado no catálogo.".to_string())?;
    return Ok(detail_from_steam(&app, &title, steam));
  };

  let resolved_group_key = game.group_key.clone().or(payload_group_key);
  let downloads =
    resolve_downloads(&app, &game, &active_sources, resolved_group_key.as_deref()).await;

  let steam = if include_steam {
    resolve_steam_details_for_app(&app, &game.title, language).await
  } else {
    None
  };
  let steam_app_id = steam.as_ref().map(|s| s.app_id);
  let synopsis = steam.as_ref().and_then(|s| s.synopsis.clone());
  let screenshots = steam.as_ref().map(|s| s.screenshots.clone()).unwrap_or_default();
  let trailer_url = steam.as_ref().and_then(|s| s.trailer_url.clone());
  let trailer_thumbnail = steam.as_ref().and_then(|s| s.trailer_thumbnail.clone());

  let mut game_with_cover = game;
  apply_genre_from_steam_or_cache(&app, &mut game_with_cover, &steam);
  attach_cover_urls(&app, &mut game_with_cover);
  fill_missing_cover(&app, &mut game_with_cover, &steam, steam_app_id);

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
