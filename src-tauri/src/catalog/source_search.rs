use super::{merge_local_and_api_catalog, stable_embedded_id};
use crate::db::{get_disabled_hydra_source_ids_from_conn, open_database_connection};
use crate::dto::CatalogGameDto;
use std::collections::HashSet;
use std::time::Duration;
use tauri::AppHandle;

fn search_local(
  app: &AppHandle,
  query: &str,
  offset: usize,
  limit: usize,
) -> Result<Vec<CatalogGameDto>, String> {
  let conn = open_database_connection(app)?;
  let sources = crate::sources::list_hydra_sources(&conn)?;
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn)?;
  let active: Vec<_> = sources
    .into_iter()
    .filter(|source| !disabled.contains(&source.id))
    .collect();
  let hits = crate::sources::hydralinks::search_distinct_catalog_titles_from_json(
    app, &active, query, offset, limit,
  );
  let mut games: Vec<_> = hits
    .into_iter()
    .map(|hit| CatalogGameDto {
      id: format!("source:{}", stable_embedded_id(&hit.group_key)),
      title: hit.title,
      genre: String::new(),
      cover_url: None,
      local_cover_path: None,
      source: hit._source_name,
      option_count: (hit.option_count > 1).then_some(hit.option_count as u32),
      group_key: Some(hit.group_key),
    })
    .collect();
  crate::covers::attach_cover_urls_to_games(app, &mut games);
  Ok(games)
}

pub async fn search_catalog_from_sources(
  app: &AppHandle,
  query: &str,
  offset: usize,
  limit: usize,
  attach_covers: bool,
  local_only: bool,
) -> Result<Vec<CatalogGameDto>, String> {
  let conn = open_database_connection(app)?;
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn)?;
  let active: Vec<_> = crate::sources::list_hydra_sources(&conn)?
    .into_iter()
    .filter(|source| !disabled.contains(&source.id))
    .collect();
  if active.is_empty() {
    return Ok(Vec::new());
  }
  let need = offset.saturating_add(limit).max(limit);
  let app_bg = app.clone();
  let query_bg = query.to_string();
  let local = tokio::task::spawn_blocking(move || search_local(&app_bg, &query_bg, 0, need))
    .await
    .map_err(|error| format!("search_catalog_task: {error}"))??;
  if local_only {
    return Ok(local.into_iter().skip(offset).take(limit).collect());
  }
  let api_sources: Vec<_> = active
    .into_iter()
    .filter(|source| source.api_source_id.as_deref().is_some_and(|id| !id.is_empty()))
    .collect();
  let exclude: HashSet<_> = local
    .iter()
    .map(|game| {
      game.group_key.as_deref()
        .map(crate::title::canonical_catalog_group_key)
        .unwrap_or_else(|| crate::title::catalog_game_group_key(&game.title))
    })
    .collect();
  let api = if api_sources.is_empty() {
    Vec::new()
  } else {
    tokio::time::timeout(
      Duration::from_millis(8_000),
      crate::sources::search_catalog_games_via_api(app, &api_sources, query, 0, need.max(12), &exclude),
    )
    .await
    .unwrap_or_default()
  };
  let mut page: Vec<_> = merge_local_and_api_catalog(local, api, need)
    .into_iter()
    .skip(offset)
    .take(limit)
    .collect();
  if attach_covers {
    crate::covers::attach_cover_urls_to_games(app, &mut page);
  }
  Ok(page)
}
