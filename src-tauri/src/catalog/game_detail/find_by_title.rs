use super::find_by_key::find_catalog_game_by_group_key;
use crate::catalog::title_matches_query;
use crate::dto::{CatalogGameDto, HydraSourceDto};
use crate::sources::load_cached_catalog_for_source;
use crate::title::catalog_game_group_key;
use tauri::AppHandle;

pub(crate) fn find_catalog_game_by_title(
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
