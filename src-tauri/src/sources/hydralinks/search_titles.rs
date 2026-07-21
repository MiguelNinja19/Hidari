use super::cache_index::candidate_indices_for_query;
use super::cache_load::load_cached_catalog_for_source;
use super::types::{CatalogTitleHit, IndexedDownload};
use super::uri::count_usable_uris;
use crate::catalog::{normalize_match_text, title_norm_matches_query_norm};
use crate::dto::HydraSourceDto;
use std::collections::HashMap;
use tauri::AppHandle;

pub fn search_distinct_catalog_titles_from_json(
  app: &AppHandle,
  sources: &[HydraSourceDto],
  query: &str,
  offset: usize,
  limit: usize,
) -> Vec<CatalogTitleHit> {
  if sources.is_empty() || query.trim().len() < 2 || limit == 0 {
    return Vec::new();
  }

  let query_norm = normalize_match_text(query);
  if query_norm.is_empty() {
    return Vec::new();
  }

  let mut groups: HashMap<String, CatalogTitleHit> = HashMap::new();

  for source in sources {
    let Some(catalog) = load_cached_catalog_for_source(app, source) else {
      continue;
    };
    let source_name = catalog
      .name
      .as_ref()
      .map(|name| name.trim().to_string())
      .filter(|name| !name.is_empty())
      .unwrap_or_else(|| source.name.clone());

    let candidate_idxs = candidate_indices_for_query(&catalog, &query_norm);
    let iter: Box<dyn Iterator<Item = &IndexedDownload>> = if let Some(idxs) = candidate_idxs {
      Box::new(idxs.iter().filter_map(|&i| catalog.downloads.get(i)))
    } else {
      Box::new(catalog.downloads.iter())
    };

    for download in iter {
      if !title_norm_matches_query_norm(&download.title_norm, &query_norm) {
        continue;
      }
      if download.group_key.is_empty() {
        continue;
      }
      // Só listar títulos com pelo menos um link utilizável (magnet/http).
      let usable = count_usable_uris(&download.uris);
      if usable == 0 {
        continue;
      }
      let canonical_key =
        crate::title::canonical_catalog_group_key(&download.group_key);
      let bucket_key = groups
        .keys()
        .find(|existing| {
          crate::title::catalog_search_group_keys_equivalent(existing, &canonical_key)
            || crate::title::catalog_search_group_keys_equivalent(existing, &download.group_key)
        })
        .cloned()
        .unwrap_or_else(|| canonical_key.clone());

      if let Some(hit) = groups.get_mut(&bucket_key) {
        hit.option_count = hit.option_count.saturating_add(usable);
      } else {
        groups.insert(
          bucket_key,
          CatalogTitleHit {
            title: crate::title::catalog_game_display_title_from_group_key(&canonical_key),
            _source_name: source_name.clone(),
            group_key: canonical_key,
            option_count: usable,
          },
        );
      }
    }
  }

  let mut ordered: Vec<CatalogTitleHit> = groups.into_values().collect();
  ordered.sort_by(|a, b| {
    a.title
      .len()
      .cmp(&b.title.len())
      .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
  });
  ordered.into_iter().skip(offset).take(limit).collect()
}
