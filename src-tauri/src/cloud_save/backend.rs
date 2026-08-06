//! The CloudSaveBackend trait  implemented by each storage backend.

use super::{ArtifactMetadata, CloudSaveError, UploadResult};
use async_trait::async_trait;
use std::path::Path;

#[async_trait]
pub trait CloudSaveBackend: Send + Sync {
  /// List all artifacts stored for a given game.
  async fn list_artifacts(
    &self,
    shop: &str,
    object_id: &str,
  ) -> Result<Vec<ArtifactMetadata>, CloudSaveError>;

  /// Upload a tar file as a new artifact for a game.
  /// Returns the new artifact's ID and size.
  async fn upload_artifact(
    &self,
    shop: &str,
    object_id: &str,
    tar_path: &Path,
    label: &str,
  ) -> Result<UploadResult, CloudSaveError>;

  /// Download an artifact to a local destination path.
  async fn download_artifact(
    &self,
    artifact_id: &str,
    dest_path: &Path,
  ) -> Result<(), CloudSaveError>;

  /// Delete an artifact.
  async fn delete_artifact(&self, artifact_id: &str) -> Result<(), CloudSaveError>;

  /// Freeze or unfreeze an artifact (protect from auto-pruning).
  async fn set_artifact_frozen(
    &self,
    artifact_id: &str,
    frozen: bool,
  ) -> Result<(), CloudSaveError>;

  /// Test the backend connection (used by Settings UI).
  /// Returns Ok(()) if connection works, Err with message otherwise.
  async fn test_connection(&self) -> Result<String, CloudSaveError>;
}
