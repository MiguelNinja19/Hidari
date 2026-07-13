use crate::catalog::steam_details::{cached_genres_for_title, resolve_steam_details_for_app};
use crate::catalog::{stable_embedded_id, title_matches_query};
use crate::db::{get_disabled_hydra_source_ids_from_conn, open_database_connection};
use crate::dto::{CatalogGameDto, DownloadOptionDto, GameDetailDto, GetGameDetailPayload, HydraSourceDto};
use crate::sources::{
  list_download_options_for_group_key, list_hydra_sources, load_cached_catalog_for_source,
  search_download_options_from_local_sources,
};
use crate::title::{catalog_game_display_title_from_group_key, catalog_game_group_key};
use tauri::AppHandle;

fn filter_options_for_group_key(
  options: Vec<DownloadOptionDto>,
  group_key: &str,
) -> Vec<DownloadOptionDto> {
  let group_key = group_key.trim();
  if group_key.is_empty() {
    return options;
  }
  let query_canon = crate::title::canonical_catalog_group_key(group_key);
  options
    .into_iter()
    .filter(|option| {
      let option_key = catalog_game_group_key(&option.title);
      let option_canon = crate::title::canonical_catalog_group_key(&option_key);
      option_key == group_key
        || option_canon == query_canon
        || crate::title::catalog_search_group_keys_equivalent(&option_canon, &query_canon)
        || crate::title::catalog_search_group_keys_equivalent(&query_canon, &option_canon)
    })
    .collect()
}

fn find_catalog_game_by_group_key(
  app: &AppHandle,
  sources: &[HydraSourceDto],
  group_key: &str,
) -> Option<CatalogGameDto> {
  let group_key = group_key.trim();
  if group_key.is_empty() {
    return None;
  }

  let mut option_count = 0usize;
  let mut source_name = String::from("Catálogo");
  let mut found = false;
  let query_canon = crate::title::canonical_catalog_group_key(group_key);

  for source in sources {
    let Some(catalog) = load_cached_catalog_for_source(app, source) else {
      continue;
    };
    for download in &catalog.downloads {
      let download_canon = crate::title::canonical_catalog_group_key(&download.group_key);
      let matches = download.group_key == group_key
        || download_canon == query_canon
        || crate::title::catalog_search_group_keys_equivalent(&download_canon, &query_canon)
        || crate::title::catalog_search_group_keys_equivalent(&query_canon, &download_canon);
      if !matches {
        continue;
      }
      found = true;
      option_count += 1;
      if source_name == "Catálogo" {
        source_name = catalog
          .name
          .as_ref()
          .map(|name| name.trim().to_string())
          .filter(|name| !name.is_empty())
          .unwrap_or_else(|| source.name.clone());
      }
    }
  }

  if !found {
    // Ainda assim devolver o jogo se o group_key veio da pesquisa (API / cache parcial).
    return Some(CatalogGameDto {
      id: format!("source:{}", stable_embedded_id(group_key)),
      title: catalog_game_display_title_from_group_key(group_key),
      genre: source_name,
      cover_url: None,
      local_cover_path: None,
      source: "source".to_string(),
      option_count: None,
      group_key: Some(group_key.to_string()),
    });
  }

  Some(CatalogGameDto {
    id: format!("source:{}", stable_embedded_id(group_key)),
    title: catalog_game_display_title_from_group_key(group_key),
    genre: source_name,
    cover_url: None,
    local_cover_path: None,
    source: "source".to_string(),
    option_count: (option_count > 1).then_some(option_count as u32),
    group_key: Some(group_key.to_string()),
  })
}

fn find_catalog_game_by_title(
  app: &AppHandle,
  sources: &[HydraSourceDto],
  title: &str,
) -> Option<CatalogGameDto> {
  let trimmed = title.trim();
  if trimmed.is_empty() {
    return None;
  }

  let exact_key = catalog_game_group_key(trimmed);
  if !exact_key.is_empty() {
    for source in sources {
      let Some(catalog) = load_cached_catalog_for_source(app, source) else {
        continue;
      };
      if catalog
        .downloads
        .iter()
        .any(|download| download.group_key == exact_key)
      {
        return find_catalog_game_by_group_key(app, sources, &exact_key);
      }
    }
  }

  let mut best: Option<(usize, String)> = None;
  for source in sources {
    let Some(catalog) = load_cached_catalog_for_source(app, source) else {
      continue;
    };
    for download in &catalog.downloads {
      if !title_matches_query(&download.title, trimmed) {
        continue;
      }
      if download.group_key.is_empty() {
        continue;
      }
      // Preferir a chave mais específica (mais longa) para evitar colapsar subtítulos.
      let score = download.group_key.len();
      if best
        .as_ref()
        .map(|(best_score, _)| score > *best_score)
        .unwrap_or(true)
      {
        best = Some((score, download.group_key.clone()));
      }
    }
  }

  best.and_then(|(_, group_key)| find_catalog_game_by_group_key(app, sources, &group_key))
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

  let hydra_sources = list_hydra_sources(&conn)?;
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn)?;
  let active_sources: Vec<_> = hydra_sources
    .into_iter()
    .filter(|s| !disabled.contains(&s.id))
    .collect();
  drop(conn);

  let game = if let Some(group_key) = payload_group_key.as_deref() {
    find_catalog_game_by_group_key(&app, &active_sources, group_key)
  } else if let Some(title) = payload_title.as_deref() {
    find_catalog_game_by_title(&app, &active_sources, title)
  } else {
    None
  }
  .ok_or_else(|| "Jogo não encontrado no catálogo.".to_string())?;

  let resolved_group_key = payload_group_key.or_else(|| game.group_key.clone());

  let downloads = if let Some(group_key) = resolved_group_key.as_deref() {
    let options = list_download_options_for_group_key(&app, &active_sources, group_key);
    // Com opções locais, devolver já — não esperar API (picker fluido).
    if !options.is_empty() {
      options
    } else {
      let searched =
        search_download_options_from_local_sources(&app, &game.title, &active_sources).await;
      let filtered = filter_options_for_group_key(searched.clone(), group_key);
      if !filtered.is_empty() {
        filtered
      } else {
        // group_key pode divergir ligeiramente do título do repack — manter matches por título.
        searched
          .into_iter()
          .filter(|option| title_matches_query(&option.title, &game.title))
          .collect()
      }
    }
  } else {
    search_download_options_from_local_sources(&app, &game.title, &active_sources).await
  };

  let include_steam = payload.include_steam.unwrap_or(false);
  let language = payload.language.as_deref();
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
