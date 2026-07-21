use super::paths::hydralinks_remote_url_for_local_path;
use super::url_detect::is_local_catalog_path;
use crate::dto::HydraSourceDto;

pub fn resolve_remote_catalog_url(source: &HydraSourceDto) -> Option<String> {
  source
    .remote_url
    .as_ref()
    .map(|value| value.trim())
    .filter(|value| !value.is_empty())
    .map(str::to_string)
    .or_else(|| hydralinks_remote_url_for_local_path(&source.url))
}

pub fn is_syncable_catalog_source(source: &HydraSourceDto) -> bool {
  is_local_catalog_path(&source.url)
    || resolve_remote_catalog_url(source).is_some()
    || source
      .api_source_id
      .as_ref()
      .is_some_and(|value| !value.is_empty())
}
