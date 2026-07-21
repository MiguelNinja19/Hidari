use super::cache_index::candidate_indices_for_query;
use super::cache_load::load_cached_catalog_for_source;
use super::types::{CachedCatalog, IndexedDownload, MAX_TITLES_PER_SOURCE};
use super::uri::classify_uri;
use crate::catalog::{normalize_match_text, title_norm_matches_query_norm};
use crate::dto::{DownloadOptionDto, HydraSourceDto};
use crate::sources::enrich_magnet_url;
use std::collections::HashSet;
use tauri::AppHandle;

fn options_from_cached(
  source: &HydraSourceDto,
  catalog: &CachedCatalog,
  query: &str,
) -> Vec<DownloadOptionDto> {
  let query_norm = normalize_match_text(query);
  if query_norm.is_empty() {
    return Vec::new();
  }

  let source_name = catalog
    .name
    .as_ref()
    .map(|name| name.trim().to_string())
    .filter(|name| !name.is_empty())
    .unwrap_or_else(|| source.name.clone());

  let mut options = Vec::new();
  let mut seen_urls = HashSet::new();
  let mut seen_titles = HashSet::new();

  let candidate_idxs = candidate_indices_for_query(catalog, &query_norm);
  let iter: Box<dyn Iterator<Item = &IndexedDownload>> = if let Some(idxs) = candidate_idxs {
    Box::new(idxs.iter().filter_map(|&i| catalog.downloads.get(i)))
  } else {
    Box::new(catalog.downloads.iter())
  };

  for download in iter {
    if !title_norm_matches_query_norm(&download.title_norm, &query_norm) {
      continue;
    }
    if download.title_norm.is_empty() || !seen_titles.insert(download.title_norm.clone()) {
      continue;
    }

    for (idx, uri) in download.uris.iter().enumerate() {
      let Some((download_type, mut url)) = classify_uri(uri) else {
        continue;
      };

      if !seen_urls.insert(url.clone()) {
        continue;
      }

      if download_type == "torrent" && url.to_ascii_lowercase().starts_with("magnet:?") {
        url = enrich_magnet_url(&url);
      }

      let quality = download
        .file_size
        .as_ref()
        .map(|size| size.trim().to_string())
        .filter(|size| !size.is_empty())
        .unwrap_or_else(|| format!("Link {}", idx + 1));

      options.push(DownloadOptionDto {
        source_id: source.id.clone(),
        source_name: source_name.clone(),
        title: download.title.clone(),
        download_type,
        url,
        quality,
        cover_url: None,
      });
    }

    if seen_titles.len() >= MAX_TITLES_PER_SOURCE {
      return options;
    }
  }

  options
}

pub fn search_json_catalog_source(
  app: &AppHandle,
  source: &HydraSourceDto,
  query: &str,
) -> Vec<DownloadOptionDto> {
  let Some(catalog) = load_cached_catalog_for_source(app, source) else {
    return Vec::new();
  };
  options_from_cached(source, &catalog, query)
}
