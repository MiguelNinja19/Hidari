use super::{
  api_source_context, hydra_catalogue_search, persist_options, resolve_game_candidate,
  HydraCatalogueGame,
};
use crate::dto::{CatalogGameDto, DownloadOptionDto, HydraSourceDto};
use std::collections::{HashMap, HashSet};

pub async fn search_catalog_games_via_api(
  app: &tauri::AppHandle,
  sources: &[HydraSourceDto],
  query: &str,
  offset: usize,
  limit: usize,
  exclude_keys: &HashSet<String>,
) -> Vec<CatalogGameDto> {
  if query.trim().len() < 2 || limit == 0 {
    return Vec::new();
  }
  let (api_ids, source_map, fingerprints) = api_source_context(sources);
  if api_ids.is_empty() || fingerprints.is_empty() {
    return Vec::new();
  }
  let take = limit.saturating_mul(3).clamp(16, 48);
  let catalogue = match hydra_catalogue_search(query, &fingerprints, take, offset).await {
    Ok(value) => value,
    Err(error) => {
      eprintln!("hydra_catalogue_search_failed: {error}");
      return Vec::new();
    }
  };
  let mut pending: Vec<HydraCatalogueGame> = catalogue
    .edges
    .into_iter()
    .filter(|game| {
      let key = crate::title::catalog_game_group_key(&game.title);
      let canonical = crate::title::canonical_catalog_group_key(&key);
      !exclude_keys.contains(&key) && !exclude_keys.contains(&canonical)
    })
    .collect();
  let mut games = Vec::with_capacity(limit.min(pending.len()));
  let mut grouped: HashMap<String, Vec<DownloadOptionDto>> = HashMap::new();
  while !pending.is_empty() && games.len() < limit {
    let batch: Vec<_> = pending.drain(..pending.len().min(4)).collect();
    let handles: Vec<_> = batch
      .into_iter()
      .map(|game| {
        tokio::spawn(resolve_game_candidate(
          game,
          api_ids.clone(),
          source_map.clone(),
        ))
      })
      .collect();
    for handle in handles {
      if let Ok(Some((game, options))) = handle.await {
        for option in options {
          grouped.entry(option.source_id.clone()).or_default().push(option);
        }
        games.push(game);
        if games.len() >= limit {
          break;
        }
      }
    }
  }
  persist_options(app, sources, grouped);
  games
}
