use super::types::{CachedCatalog, FileFingerprint, HydraLinksCatalog, HydraLinksDownload, IndexedDownload};
use crate::catalog::normalize_match_text;
use std::collections::HashMap;

pub(crate) fn index_catalog(catalog: HydraLinksCatalog, fingerprint: Option<FileFingerprint>) -> CachedCatalog {
  let downloads: Vec<IndexedDownload> = catalog
    .downloads
    .into_iter()
    .filter_map(|download| {
      let title = download.title.trim().to_string();
      if title.is_empty() {
        return None;
      }
      let title_norm = normalize_match_text(&title);
      if title_norm.is_empty() {
        return None;
      }
      let group_key = crate::title::catalog_game_group_key(&title);
      Some(IndexedDownload {
        title,
        title_norm,
        group_key,
        file_size: download.file_size,
        uris: download.uris,
      })
    })
    .collect();

  let mut prefix_index: HashMap<String, Vec<usize>> = HashMap::new();
  for (idx, download) in downloads.iter().enumerate() {
    for word in download.title_norm.split_whitespace() {
      let key: String = word.chars().take(2).collect();
      if key.chars().count() < 2 {
        continue;
      }
      prefix_index.entry(key).or_default().push(idx);
    }
  }

  CachedCatalog {
    name: catalog.name,
    downloads,
    prefix_index,
    fingerprint,
  }
}

pub(crate) fn candidate_indices_for_query<'a>(
  catalog: &'a CachedCatalog,
  query_norm: &str,
) -> Option<&'a [usize]> {
  let first_word = query_norm.split_whitespace().next()?;
  let key: String = first_word.chars().take(2).collect();
  if key.chars().count() < 2 {
    return None;
  }
  catalog.prefix_index.get(&key).map(Vec::as_slice)
}

pub(crate) fn catalog_from_cached(cached: &CachedCatalog) -> HydraLinksCatalog {
  HydraLinksCatalog {
    name: cached.name.clone(),
    downloads: cached
      .downloads
      .iter()
      .map(|download| HydraLinksDownload {
        title: download.title.clone(),
        file_size: download.file_size.clone(),
        uris: download.uris.clone(),
        upload_date: None,
      })
      .collect(),
  }
}
