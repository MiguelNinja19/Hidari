pub mod hydra;
pub mod hydralinks;

pub use hydra::*;
pub use hydralinks::*;

use crate::config;
use crate::dto::{DownloadOptionDto, HydraSourceDto};
use tauri::AppHandle;
use url::Url;

pub fn validate_source_url(value: &str) -> Result<(), String> {
  if is_local_catalog_path(value) {
    return Ok(());
  }
  let parsed = Url::parse(value).map_err(|_| "invalid_source_url".to_string())?;
  let scheme = parsed.scheme();
  if scheme != "http" && scheme != "https" {
    return Err("source_url_must_be_http_or_https".to_string());
  }
  Ok(())
}

pub fn validate_job_url(value: &str) -> Result<(), String> {
  let parsed = Url::parse(value).map_err(|_| "invalid_job_url".to_string())?;
  if !matches!(parsed.scheme(), "http" | "https" | "magnet") {
    return Err("job_url_must_be_http_https_or_magnet".to_string());
  }
  if parsed.scheme() == "magnet" {
    let has_btih = parsed
      .query_pairs()
      .any(|(key, val)| key == "xt" && val.to_ascii_lowercase().starts_with("urn:btih:"));
    if !has_btih {
      return Err("invalid_magnet_missing_btih".to_string());
    }
  }
  Ok(())
}
fn percent_encode_tracker(tracker: &str) -> String {
  let mut out = String::with_capacity(tracker.len() + 8);
  for byte in tracker.bytes() {
    match byte {
      b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
        out.push(byte as char);
      }
      _ => out.push_str(&format!("%{byte:02X}")),
    }
  }
  out
}

/// Adds public trackers to magnet links with few or no trackers (speeds up metadata fetch).
pub fn enrich_magnet_url(raw: &str) -> String {
  if !raw.to_ascii_lowercase().starts_with("magnet:?") {
    return raw.to_string();
  }

  let lower = raw.to_lowercase();
  let tracker_count = lower.matches("&tr=").count() + if lower.contains("?tr=") { 1 } else { 0 };
  if tracker_count >= 6 {
    return raw.to_string();
  }

  let mut enriched = raw.to_string();
  for tracker in config::DEFAULT_MAGNET_TRACKERS {
    if lower.contains(&tracker.to_lowercase()) {
      continue;
    }
    enriched.push_str("&tr=");
    enriched.push_str(&percent_encode_tracker(tracker));
  }
  enriched
}

pub async fn search_download_options_from_local_sources(
  app: &AppHandle,
  query: &str,
  sources: &[HydraSourceDto],
) -> Vec<DownloadOptionDto> {
  let app = app.clone();
  let query = query.to_string();
  let active: Vec<HydraSourceDto> = sources
    .iter()
    .filter(|source| is_json_catalog_source(&source.url) || has_local_catalog(&app, &source.id))
    .cloned()
    .collect();

  if active.is_empty() {
    return Vec::new();
  }

  if active.len() == 1 {
    return search_json_catalog_source(&app, &active[0], &query);
  }

  let mut join_set = tokio::task::JoinSet::new();
  for source in active {
    let app_bg = app.clone();
    let query_bg = query.clone();
    join_set.spawn_blocking(move || search_json_catalog_source(&app_bg, &source, &query_bg));
  }

  let mut all = Vec::new();
  while let Some(result) = join_set.join_next().await {
    if let Ok(mut chunk) = result {
      all.append(&mut chunk);
    }
  }
  all
}
