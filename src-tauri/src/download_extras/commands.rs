//! Tauri IPC commands for download extras.

use super::debrid;
use super::hosters;
use super::{DebridCredentials, DebridService, DownloadExtrasError, ResolvedDownload};
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

/// Tauri-managed state holding stored credentials.
pub struct DownloadExtrasState {
  pub credentials: Mutex<DebridCredentials>,
}

impl Default for DownloadExtrasState {
  fn default() -> Self {
    Self {
      credentials: Mutex::new(DebridCredentials::default()),
    }
  }
}

#[derive(Debug, Serialize)]
pub struct DownloadExtrasCommandError {
  pub message: String,
}

impl From<DownloadExtrasError> for DownloadExtrasCommandError {
  fn from(e: DownloadExtrasError) -> Self {
    DownloadExtrasCommandError { message: e.message }
  }
}

impl From<String> for DownloadExtrasCommandError {
  fn from(s: String) -> Self {
    DownloadExtrasCommandError { message: s }
  }
}

type ApiResult<T> = Result<T, DownloadExtrasCommandError>;

/// Get stored debrid credentials.
#[tauri::command]
pub async fn get_debrid_credentials(
  state: State<'_, DownloadExtrasState>,
) -> ApiResult<DebridCredentials> {
  let creds = state
    .credentials
    .lock()
    .map_err(|e| DownloadExtrasCommandError {
      message: format!("lock error: {e}"),
    })?;
  Ok(creds.clone())
}

/// Update stored debrid credentials.
#[tauri::command]
pub async fn set_debrid_credentials(
  credentials: DebridCredentials,
  state: State<'_, DownloadExtrasState>,
) -> ApiResult<()> {
  let mut current = state
    .credentials
    .lock()
    .map_err(|e| DownloadExtrasCommandError {
      message: format!("lock error: {e}"),
    })?;
  *current = credentials;
  Ok(())
}

/// Resolve a magnet or URL via a debrid service.
/// Returns a direct HTTP download URL.
#[tauri::command]
pub async fn resolve_with_debrid(
  service: DebridService,
  magnet_or_url: String,
  state: State<'_, DownloadExtrasState>,
) -> ApiResult<ResolvedDownload> {
  let creds = state
    .credentials
    .lock()
    .map_err(|e| DownloadExtrasCommandError {
      message: format!("lock error: {e}"),
    })?
    .clone();

  let result = debrid::resolve(service, &magnet_or_url, &creds).await?;
  Ok(result)
}

/// Detect which hoster a URL belongs to (if any).
#[tauri::command]
pub async fn detect_hoster(url: String) -> ApiResult<Option<String>> {
  Ok(super::detect_hoster(&url).map(|h| h.label().to_string()))
}

/// Resolve a hoster URL (Mediafire, PixelDrain, etc.) to a direct download URL.
#[tauri::command]
pub async fn resolve_hoster_url(url: String) -> ApiResult<ResolvedDownload> {
  let hoster = super::detect_hoster(&url).ok_or_else(|| DownloadExtrasCommandError {
    message: format!("no scraper available for URL: {url}"),
  })?;
  let result = hosters::resolve(hoster, &url).await?;
  Ok(result)
}

/// List all supported debrid services.
#[tauri::command]
pub async fn list_debrid_services() -> ApiResult<Vec<String>> {
  Ok(DebridService::all().iter().map(|s| s.label().to_string()).collect())
}
