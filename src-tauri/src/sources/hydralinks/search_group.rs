use super::cache_load::load_cached_catalog_for_source;
use super::uri::classify_uri;
use crate::dto::{DownloadOptionDto, HydraSourceDto};
use crate::sources::enrich_magnet_url;
use std::collections::HashSet;
use tauri::AppHandle;

pub fn list_download_options_for_group_key(
  app: &AppHandle,
  sources: &[HydraSourceDto],
  group_key: &str,
) -> Vec<DownloadOptionDto> {
  let group_key = group_key.trim();
  if group_key.is_empty() || sources.is_empty() {
    return Vec::new();
  }
  let query_canon = crate::title::canonical_catalog_group_key(group_key);

  let mut options = Vec::new();
  let mut seen_urls = HashSet::new();
  let mut seen_source_titles = HashSet::new();

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

    for download in &catalog.downloads {
      let download_canon = crate::title::canonical_catalog_group_key(&download.group_key);
      let matches = download.group_key == group_key
        || download_canon == query_canon
        || crate::title::catalog_search_group_keys_equivalent(&download_canon, &query_canon)
        || crate::title::catalog_search_group_keys_equivalent(&query_canon, &download_canon);
      if !matches {
        continue;
      }
      if download.title_norm.is_empty() {
        continue;
      }
      let source_title_key = format!("{}\0{}", source.id, download.title_norm);
      if !seen_source_titles.insert(source_title_key) {
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
    }
  }

  options.sort_by(|a, b| {
    a.source_name
      .to_lowercase()
      .cmp(&b.source_name.to_lowercase())
      .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
  });
  options
}
