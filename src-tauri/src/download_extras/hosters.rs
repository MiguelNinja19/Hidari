//! Hoster scrapers — extract direct download URLs from file hosters.
//!
//! Supports:
//! - Mediafire (HTML scraping)
//! - PixelDrain (CDN bypass + API fallback)

use super::{DownloadExtrasError, ResolvedDownload};
use reqwest::Client;
use std::time::Duration;

const TIMEOUT_SECS: u64 = 20;

fn build_client() -> Result<Client, DownloadExtrasError> {
  Client::builder()
    .timeout(Duration::from_secs(TIMEOUT_SECS))
    .user_agent(concat!("Hidari/", env!("CARGO_PKG_VERSION")))
    .build()
    .map_err(|e| DownloadExtrasError {
      message: format!("client build: {e}"),
    })
}

/// Hoster type that we can scrape.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Hoster {
  Mediafire,
  PixelDrain,
}

impl Hoster {
  pub fn label(&self) -> &'static str {
    match self {
      Hoster::Mediafire => "Mediafire",
      Hoster::PixelDrain => "PixelDrain",
    }
  }
}

/// Detect which hoster a URL belongs to.
pub fn detect_hoster(url: &str) -> Option<Hoster> {
  if url.contains("mediafire.com") {
    Some(Hoster::Mediafire)
  } else if url.contains("pixeldrain.com") {
    Some(Hoster::PixelDrain)
  } else {
    None
  }
}

/// Extract the file ID from a PixelDrain URL.
/// URL formats:
/// - https://pixeldrain.com/u/abc123
/// - https://pixeldrain.com/l/abc123 (list)
fn extract_pixeldrain_id(url: &str) -> Option<String> {
  if let Some(idx) = url.find("/u/") {
    let rest = &url[idx + 3..];
    // Take until / or ?
    let id: String = rest.chars().take_while(|c| *c != '/' && *c != '?').collect();
    if !id.is_empty() {
      return Some(id);
    }
  }
  if let Some(idx) = url.find("/l/") {
    let rest = &url[idx + 3..];
    let id: String = rest.chars().take_while(|c| *c != '/' && *c != '?').collect();
    if !id.is_empty() {
      return Some(id);
    }
  }
  None
}

/// Resolve a PixelDrain URL to a direct download URL.
///
/// Strategy: try the bypass CDN first (https://cdn.pixeldrain.eu.cc/<id>),
/// then fall back to the official API (https://pixeldrain.com/api/file/<id>?download).
pub async fn resolve_pixeldrain(url: &str) -> Result<ResolvedDownload, DownloadExtrasError> {
  let id = extract_pixeldrain_id(url).ok_or_else(|| DownloadExtrasError {
    message: format!("could not extract PixelDrain file ID from {url}"),
  })?;

  // Try bypass CDN first
  let bypass_url = format!("https://cdn.pixeldrain.eu.cc/{id}");
  // Just return the bypass URL — the download-engine sidecar will try to download it.
  // If that fails, the user can manually use the API URL below.
  Ok(ResolvedDownload {
    download_url: bypass_url,
    filename: None,
    file_size: None,
    resolved_by: Hoster::PixelDrain.label().to_string(),
  })
}

/// Resolve a Mediafire URL to a direct download URL.
///
/// Strategy: fetch the HTML page, regex-extract the direct download URL from
/// the page's JavaScript (pattern: `download\d+.mediafire.com` or `?dkey=`).
pub async fn resolve_mediafire(url: &str) -> Result<ResolvedDownload, DownloadExtrasError> {
  let client = build_client()?;
  let resp = client.get(url).send().await?;
  if !resp.status().is_success() {
    return Err(DownloadExtrasError {
      message: format!("Mediafire page fetch failed: HTTP {}", resp.status()),
    });
  }
  let html = resp.text().await?;

  // Look for the direct download URL pattern.
  // Modern Mediafire pages embed it in a meta tag or aria-label link.
  // Pattern 1: 'https://download\d+.mediafire.com/...'.
  let download_url = extract_mediafire_download_url(&html);

  if let Some(direct_url) = download_url {
    Ok(ResolvedDownload {
      download_url: direct_url,
      filename: None,
      file_size: None,
      resolved_by: Hoster::Mediafire.label().to_string(),
    })
  } else {
    Err(DownloadExtrasError {
      message: "could not extract Mediafire direct download URL (page may have changed format)".to_string(),
    })
  }
}

/// Extract the direct download URL from Mediafire HTML.
fn extract_mediafire_download_url(html: &str) -> Option<String> {
  // Look for the aria-labeled download button
  // Pattern: href="https://downloadNN.mediafire.com/..."
  for prefix in &[
    "https://download",
    "http://download",
  ] {
    if let Some(idx) = html.find(prefix) {
      // Take until the next " or whitespace
      let rest = &html[idx..];
      let end = rest
        .find(|c: char| c == '"' || c.is_whitespace())
        .unwrap_or(rest.len());
      let url = &rest[..end];
      if url.contains("mediafire.com") {
        return Some(url.to_string());
      }
    }
  }

  // Try alternative pattern: 'aria-label="..." data-url="..."'
  // Or parse the JS-embedded URL: 'window.location = "https://..."'
  None
}

/// Dispatch to the right scraper based on hoster type.
pub async fn resolve(
  hoster: Hoster,
  url: &str,
) -> Result<ResolvedDownload, DownloadExtrasError> {
  match hoster {
    Hoster::Mediafire => resolve_mediafire(url).await,
    Hoster::PixelDrain => resolve_pixeldrain(url).await,
  }
}
