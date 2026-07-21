use crate::dto::HydraSourceDto;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::{SystemTime, UNIX_EPOCH};

fn now_ms() -> String {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis())
    .unwrap_or(0)
    .to_string()
}

pub fn create_hydra_source(local_path: &str, remote_url: Option<&str>) -> HydraSourceDto {
  let url = local_path.trim().to_string();
  let remote_url = remote_url
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(str::to_string);
  let mut hasher = DefaultHasher::new();
  url.hash(&mut hasher);
  HydraSourceDto {
    id: format!("local_{:x}", hasher.finish()),
    name: super::display_name_for_source_url(remote_url.as_deref().unwrap_or(&url)),
    url,
    status: "MATCHED".to_string(),
    download_count: 0,
    fingerprint: None,
    api_source_id: None,
    remote_url,
    created_at: now_ms(),
  }
}

pub fn create_hydra_source_from_remote(remote_url: &str, cache_path: &str) -> HydraSourceDto {
  let remote_url = remote_url.trim().to_string();
  let mut hasher = DefaultHasher::new();
  remote_url.hash(&mut hasher);
  HydraSourceDto {
    id: format!("remote_{:x}", hasher.finish()),
    name: super::display_name_for_source_url(&remote_url),
    url: cache_path.trim().to_string(),
    status: "MATCHED".to_string(),
    download_count: 0,
    fingerprint: None,
    api_source_id: None,
    remote_url: Some(remote_url),
    created_at: now_ms(),
  }
}
