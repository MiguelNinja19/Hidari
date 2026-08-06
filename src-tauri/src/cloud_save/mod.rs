//! Cloud Save backend with multi-backend architecture.
//!
//! Supports:
//! - Local folder (Dropbox/OneDrive mounted)
//! - WebDAV (Nextcloud, Synology, etc.)  implemented
//! - Hydra API backend  TODO (needs auth)
//!
//! Each backend implements the `CloudSaveBackend` trait. The frontend
//! interacts uniformly via the same IPC commands regardless of backend.

pub mod backend;
pub mod local_backend;
pub mod webdav_backend;
pub mod tar_util;
pub mod commands;

use serde::{Deserialize, Serialize};

/// Backend type identifier (stored in app_settings).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BackendType {
  /// Local folder (Dropbox/OneDrive mounted). Simplest.
  Local,
  /// WebDAV server (Nextcloud, Synology, etc.).
  Webdav,
  /// Hydra Cloud API backend (requires Hydra account + subscription).
  Hydra,
}

impl Default for BackendType {
  fn default() -> Self {
    BackendType::Local
  }
}

/// Metadata for a stored cloud save artifact (backup).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactMetadata {
  /// Unique ID (timestamp-based for local/webdav, server-issued for hydra).
  pub id: String,
  /// User-provided label, e.g. "Manual backup" or "Auto - 2026-08-01".
  pub label: String,
  /// Size in bytes of the tar file.
  pub size_bytes: u64,
  /// Unix timestamp (seconds) of creation.
  pub created_at: i64,
  /// Hostname that created the artifact.
  pub hostname: String,
  /// Whether this artifact is frozen (protected from auto-pruning).
  pub is_frozen: bool,
}

/// Result of an upload operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadResult {
  pub artifact_id: String,
  pub size_bytes: u64,
}

/// Settings for the active cloud save backend.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CloudSaveSettings {
  pub backend: BackendType,
  /// Local folder path (for BackendType::Local).
  pub local_folder: Option<String>,
  /// WebDAV server URL (for BackendType::Webdav).
  pub webdav_url: Option<String>,
  /// WebDAV username (basic auth).
  pub webdav_username: Option<String>,
  /// WebDAV password (basic auth). Stored in plaintext for now (TODO: encrypt with OS keyring).
  pub webdav_password: Option<String>,
  /// Hydra API auth token (for BackendType::Hydra).
  pub hydra_token: Option<String>,
}

/// Error type for cloud save operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudSaveError {
  pub message: String,
}

impl From<String> for CloudSaveError {
  fn from(s: String) -> Self {
    CloudSaveError { message: s }
  }
}

impl From<&str> for CloudSaveError {
  fn from(s: &str) -> Self {
    CloudSaveError { message: s.to_string() }
  }
}

impl From<std::io::Error> for CloudSaveError {
  fn from(e: std::io::Error) -> Self {
    CloudSaveError { message: format!("io: {e}") }
  }
}

impl From<reqwest::Error> for CloudSaveError {
  fn from(e: reqwest::Error) -> Self {
    CloudSaveError { message: format!("http: {e}") }
  }
}
