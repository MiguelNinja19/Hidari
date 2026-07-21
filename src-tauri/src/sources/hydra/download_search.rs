use super::{
  api_source_context, hydra_catalogue_search, hydra_game_download_sources,
  persist_options, repack_to_download_options,
};
use crate::catalog::title_matches_query;
use crate::dto::{DownloadOptionDto, HydraSourceDto};
use std::collections::{HashMap, HashSet};

pub async fn search_download_options_via_api(
  app: &tauri::AppHandle,
  sources: &[HydraSourceDto],
  query: &str,
) -> Vec<DownloadOptionDto> {
  let query = query.trim();
  if query.len() < 2 {
    return Vec::new();
  }
  let (api_ids, source_map, fingerprints) = api_source_context(sources);
  if api_ids.is_empty() {
    return Vec::new();
  }
  let catalogue = match hydra_catalogue_search(query, &fingerprints, 24, 0).await {
    Ok(value) => value,
    Err(error) => {
      eprintln!("hydra_catalogue_search_failed: {error}");
      return Vec::new();
    }
  };
  let mut options = Vec::new();
  let mut seen_urls = HashSet::new();
  let mut grouped: HashMap<String, Vec<DownloadOptionDto>> = HashMap::new();
  for game in catalogue.edges {
    let repacks = match hydra_game_download_sources(&game.shop, &game.object_id, &api_ids).await {
      Ok(value) => value,
      Err(error) => {
        eprintln!("hydra_game_download_sources_failed: {} — {error}", game.title);
        continue;
      }
    };
    for repack in repacks {
      if !title_matches_query(&repack.title, query)
        && !title_matches_query(&game.title, query)
      {
        continue;
      }
      for option in repack_to_download_options(&repack, &source_map) {
        if seen_urls.insert(option.url.clone()) {
          grouped
            .entry(option.source_id.clone())
            .or_default()
            .push(option.clone());
          options.push(option);
        }
      }
    }
  }
  persist_options(app, sources, grouped);
  options
}
