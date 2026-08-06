//! Download extras backend  debrid services and hoster scrapers.
//!
//! Provides URL resolution for:
//! - Debrid services: Real-Debrid, AllDebrid, TorBox, Premiumize, Offcloud
//! - Hoster scrapers: Mediafire, PixelDrain
///
//! Each resolver takes a magnet/URL and returns a direct HTTP URL
//! that can be passed to the existing download-engine sidecar.

pub mod debrid;
pub mod hosters;
pub mod commands;

use serde::{Deserialize, Serialize};

/// Type of debrid service.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum DebridService {
  RealDebrid,
  AllDebrid,
  TorBox,
  Premiumize,
  Offcloud,
}

impl DebridService {
  pub fn all() -> &'static [DebridService] {
    &[
      DebridService::RealDebrid,
      DebridService::AllDebrid,
      DebridService::TorBox,
      DebridService::Premiumize,
      DebridService::Offcloud,
    ]
  }

  pub fn label(&self) -> &'static str {
    match self {
      DebridService::RealDebrid => "Real-Debrid",
      DebridService::AllDebrid => "AllDebrid",
      DebridService::TorBox => "TorBox",
      DebridService::Premiumize => "Premiumize",
      DebridService::Offcloud => "Offcloud",
    }
  }

  pub fn id(&self) -> &'static str {
    match self {
      DebridService::RealDebrid => "real_debrid",
      DebridService::AllDebrid => "all_debrid",
      DebridService::TorBox => "torbox",
      DebridService::Premiumize => "premiumize",
      DebridService::Offcloud => "offcloud",
    }
  }
}

/// Result of URL resolution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedDownload {
  /// The direct HTTP URL that can be downloaded.
  pub download_url: String,
  /// Optional filename (if known).
  pub filename: Option<String>,
  /// Optional file size in bytes (if known).
  pub file_size: Option<u64>,
  /// Source that resolved this URL.
  pub resolved_by: String,
}

/// Stored credentials for a debrid service.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DebridCredentials {
  pub real_debrid_token: Option<String>,
  pub all_debrid_token: Option<String>,
  pub torbox_token: Option<String>,
  pub premiumize_token: Option<String>,
  pub offcloud_token: Option<String>,
}

/// Error type for download_extras operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadExtrasError {
  pub message: String,
}

impl From<String> for DownloadExtrasError {
  fn from(s): Self {
    DownloadExtrasError { message: s }
  }
}

impl From<reqwest::Error> for DownloadExtrasError {
  fn from(e: reqwest::Error) -> Self {
    DownloadExtrasError { message: format!("http: {e}") }
  }
}

/// Detect if a URL is a magnet link.
pub fn is_magnet(url: &str) -> bool {
  url.starts_with("magnet:?")
}

/// Detect if a URL is from a known hoster that needs scraping.
pub fn detect_hoster(url: &str) -> Option<hosters::Hoster> {
  hosters::detect_hoster(url)
}
