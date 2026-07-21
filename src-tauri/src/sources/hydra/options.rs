use super::HydraGameRepack;
use crate::dto::{DownloadOptionDto, HydraSourceDto};
use std::collections::HashMap;

pub(crate) fn repack_to_download_options(
  repack: &HydraGameRepack,
  sources: &HashMap<String, HydraSourceDto>,
) -> Vec<DownloadOptionDto> {
  let source = sources.get(&repack.download_source_id);
  let source_id = source
    .map(|value| value.id.clone())
    .unwrap_or_else(|| repack.download_source_id.clone());
  let source_name = source
    .map(|value| value.name.clone())
    .unwrap_or_else(|| repack.download_source_name.clone());
  let quality = repack.file_size.as_deref().map(str::trim).filter(|s| !s.is_empty());
  repack
    .uris
    .iter()
    .enumerate()
    .filter_map(|(index, uri)| {
      let url = uri.trim();
      let lower = url.to_ascii_lowercase();
      let download_type = if lower.starts_with("magnet:?") || lower.ends_with(".torrent") {
        "torrent"
      } else if lower.starts_with("http://") || lower.starts_with("https://") {
        "http"
      } else {
        return None;
      };
      Some(DownloadOptionDto {
        source_id: source_id.clone(),
        source_name: source_name.clone(),
        title: repack.title.clone(),
        download_type: download_type.to_string(),
        url: if lower.starts_with("magnet:?") {
          crate::sources::enrich_magnet_url(url)
        } else {
          url.to_string()
        },
        quality: quality.map(str::to_string).unwrap_or_else(|| format!("Link {}", index + 1)),
        cover_url: None,
      })
    })
    .collect()
}

pub(crate) fn api_source_context(
  sources: &[HydraSourceDto],
) -> (Vec<String>, HashMap<String, HydraSourceDto>, Vec<String>) {
  let active: Vec<_> = sources
    .iter()
    .filter(|source| source.api_source_id.as_deref().is_some_and(|id| !id.is_empty()))
    .collect();
  let ids = active.iter().filter_map(|source| source.api_source_id.clone()).collect();
  let by_id = active.iter().filter_map(|source| {
    source.api_source_id.as_ref().map(|id| (id.clone(), (*source).clone()))
  }).collect();
  let fingerprints = active.iter().filter_map(|source| {
    source.fingerprint.as_ref()
      .filter(|value| super::is_catalog_content_fingerprint(value))
      .cloned()
  }).collect();
  (ids, by_id, fingerprints)
}

pub(crate) fn persist_options(
  app: &tauri::AppHandle,
  sources: &[HydraSourceDto],
  grouped: HashMap<String, Vec<DownloadOptionDto>>,
) {
  for (source_id, options) in grouped {
    if let Some(source) = sources.iter().find(|item| item.id == source_id) {
      let source_ref = source.remote_url.as_deref().unwrap_or(&source.url);
      let _ = super::hydralinks::append_catalog_download_options(
        app, &source_id, source_ref, &options,
      );
    }
  }
}
