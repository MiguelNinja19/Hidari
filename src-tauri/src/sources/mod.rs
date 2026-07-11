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

/// Adds public trackers (and optional display name) to magnet links with few trackers.
pub fn enrich_magnet_url(raw: &str) -> String {
  enrich_magnet_url_with_title(raw, None)
}

pub fn enrich_magnet_url_with_title(raw: &str, display_name: Option<&str>) -> String {
  if !raw.to_ascii_lowercase().starts_with("magnet:?") {
    return raw.to_string();
  }

  let lower = raw.to_lowercase();
  let tracker_count = lower.matches("&tr=").count() + if lower.contains("?tr=") { 1 } else { 0 };

  let mut enriched = raw.to_string();

  if let Some(name) = display_name.map(str::trim).filter(|n| !n.is_empty()) {
    if !lower.contains("dn=") {
      enriched.push_str("&dn=");
      enriched.push_str(&percent_encode_tracker(name));
    }
  }

  if tracker_count >= 10 {
    return enriched;
  }

  let enriched_lower = enriched.to_lowercase();
  for tracker in config::DEFAULT_MAGNET_TRACKERS {
    if enriched_lower.contains(&tracker.to_lowercase()) {
      continue;
    }
    enriched.push_str("&tr=");
    enriched.push_str(&percent_encode_tracker(tracker));
  }
  enriched
}

/// Tempo máximo para a API Hydra ao listar opções de download (picker / detalhe).
const DOWNLOAD_OPTIONS_API_MS: u64 = 8_000;

pub async fn search_download_options_from_local_sources(
  app: &AppHandle,
  query: &str,
  sources: &[HydraSourceDto],
) -> Vec<DownloadOptionDto> {
  let app = app.clone();
  let query = query.to_string();
  let mut local_active = Vec::new();
  let mut api_candidates = Vec::new();

  for source in sources {
    if has_local_catalog(&app, &source.id) {
      local_active.push(source.clone());
    }
    if source
      .api_source_id
      .as_ref()
      .is_some_and(|value| !value.is_empty())
    {
      api_candidates.push(source.clone());
    }
  }

  let app_local = app.clone();
  let query_local = query.clone();
  let local_fut = async move {
    let mut local_options = Vec::new();
    if local_active.len() == 1 {
      local_options.extend(search_json_catalog_source(
        &app_local,
        &local_active[0],
        &query_local,
      ));
    } else if !local_active.is_empty() {
      let mut join_set = tokio::task::JoinSet::new();
      for source in local_active {
        let app_bg = app_local.clone();
        let query_bg = query_local.clone();
        join_set.spawn_blocking(move || search_json_catalog_source(&app_bg, &source, &query_bg));
      }

      while let Some(result) = join_set.join_next().await {
        if let Ok(mut chunk) = result {
          local_options.append(&mut chunk);
        }
      }
    }
    local_options
  };

  let app_api = app.clone();
  let query_api = query.clone();
  let api_fut = async move {
    if api_candidates.is_empty() {
      return Vec::new();
    }
    let api_future =
      hydra::search_download_options_via_api(&app_api, &api_candidates, &query_api);
    match tokio::time::timeout(
      std::time::Duration::from_millis(DOWNLOAD_OPTIONS_API_MS),
      api_future,
    )
    .await
    {
      Ok(options) => options,
      Err(_) => {
        eprintln!("hydra_download_search_timeout: query={query_api}");
        Vec::new()
      }
    }
  };

  let api_handle = tokio::spawn(api_fut);
  let local_options = local_fut.await;
  let api_options = api_handle.await.unwrap_or_else(|_| Vec::new());

  let mut all = Vec::new();
  let mut seen_urls = std::collections::HashSet::new();
  for option in local_options.into_iter().chain(api_options) {
    if seen_urls.insert(option.url.clone()) {
      all.push(option);
    }
  }

  all
}
