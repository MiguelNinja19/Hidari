//! Local folder backend.
//!
//! Saves tar files to a local folder. Useful for users who already have
//! Dropbox/OneDrive/iCloud Drive mounted. No network, no API, no limits.
//!
//! Folder structure:
//! ```text
//! <root>/hidari-cloud-save/
//!  _metadata/
//!     {shop}_{object_id}/
//!         {artifact_id}.json    # ArtifactMetadata serialized
//!  {shop}_{object_id}/
//!      {artifact_id}.tar         # actual backup file
//! ```

use super::backend::CloudSaveBackend;
use super::{ArtifactMetadata, CloudSaveError, UploadResult};
use async_trait::async_trait;
use std::path::{Path, PathBuf};

pub struct LocalBackend {
  /// Root folder where `hidari-cloud-save/` will be created.
  root: PathBuf,
}

impl LocalBackend {
  pub fn new(root: PathBuf) -> Result<Self, CloudSaveError> {
    let save_root = root.join("hidari-cloud-save");
    std::fs::create_dir_all(&save_root)?;
    std::fs::create_dir_all(save_root.join("_metadata"))?;
    Ok(Self { root: save_root })
  }

  fn game_folder(&self, shop: &str, object_id: &str) -> PathBuf {
    let folder_name = format!("{shop}_{object_id}");
    let folder = self.root.join(&folder_name);
    let _ = std::fs::create_dir_all(&folder);
    let meta_folder = self.root.join("_metadata").join(&folder_name);
    let _ = std::fs::create_dir_all(&meta_folder);
    folder
  }

  fn metadata_folder(&self, shop: &str, object_id: &str) -> PathBuf {
    let folder_name = format!("{shop}_{object_id}");
    self.root.join("_metadata").join(&folder_name)
  }

  fn hostname() -> String {
    std::env::var("HOSTNAME")
      .or_else(|_| std::env::var("COMPUTERNAME"))
      .unwrap_or_else(|_| "unknown".to_string())
  }

  fn read_metadata_file(&self, path: &Path) -> Option<ArtifactMetadata> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
  }

  fn write_metadata_file(&self, path: &Path, meta: &ArtifactMetadata) -> Result<(), CloudSaveError> {
    let content = serde_json::to_string_pretty(meta)
      .map_err(|e| CloudSaveError { message: format!("serialize: {e}") })?;
    std::fs::write(path, content)?;
    Ok(())
  }
}

#[async_trait]
impl CloudSaveBackend for LocalBackend {
  async fn list_artifacts(
    &self,
    shop: &str,
    object_id: &str,
  ) -> Result<Vec<ArtifactMetadata>, CloudSaveError> {
    let meta_folder = self.metadata_folder(shop, object_id);
    let mut artifacts = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&meta_folder) {
      for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
          if let Some(meta) = self.read_metadata_file(&path) {
            artifacts.push(meta);
          }
        }
      }
    }
    // Sort by created_at descending (newest first)
    artifacts.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(artifacts)
  }

  async fn upload_artifact(
    &self,
    shop: &str,
    object_id: &str,
    tar_path: &Path,
    label: &str,
  ) -> Result<UploadResult, CloudSaveError> {
    let game_folder = self.game_folder(shop, object_id);
    let size = std::fs::metadata(tar_path)?.len();
    let now = chrono::Utc::now().timestamp();
    let artifact_id = format!("{now}");
    let dest_tar = game_folder.join(format!("{artifact_id}.tar"));

    // Copy tar file
    std::fs::copy(tar_path, &dest_tar)?;

    // Write metadata
    let meta = ArtifactMetadata {
      id: artifact_id.clone(),
      label: label.to_string(),
      size_bytes: size,
      created_at: now,
      hostname: Self::hostname(),
      is_frozen: false,
    };
    let meta_path = self
      .metadata_folder(shop, object_id)
      .join(format!("{artifact_id}.json"));
    self.write_metadata_file(&meta_path, &meta)?;

    Ok(UploadResult {
      artifact_id,
      size_bytes: size,
    })
  }

  async fn download_artifact(
    &self,
    artifact_id: &str,
    dest_path: &Path,
  ) -> Result<(), CloudSaveError> {
    // Find the tar file by artifact_id (search all subfolders)
    let artifact_id_tar = format!("{artifact_id}.tar");
    let mut found: Option<PathBuf> = None;
    if let Ok(entries) = std::fs::read_dir(&self.root) {
      for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
          let candidate = path.join(&artifact_id_tar);
          if candidate.exists() {
            found = Some(candidate);
            break;
          }
        }
      }
    }
    let src = found.ok_or_else(|| CloudSaveError {
      message: format!("artifact {artifact_id} not found"),
    })?;
    std::fs::copy(&src, dest_path)?;
    Ok(())
  }

  async fn delete_artifact(&self, artifact_id: &str) -> Result<(), CloudSaveError> {
    let artifact_id_tar = format!("{artifact_id}.tar");
    let artifact_id_json = format!("{artifact_id}.json");
    let mut deleted_any = false;
    if let Ok(entries) = std::fs::read_dir(&self.root) {
      for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
          let tar_candidate = path.join(&artifact_id_tar);
          if tar_candidate.exists() {
            let _ = std::fs::remove_file(&tar_candidate);
            deleted_any = true;
          }
          let json_candidate = path.join(&artifact_id_json);
          if json_candidate.exists() {
            let _ = std::fs::remove_file(&json_candidate);
          }
        }
      }
    }
    if !deleted_any {
      return Err(CloudSaveError {
        message: format!("artifact {artifact_id} not found"),
      });
    }
    Ok(())
  }

  async fn set_artifact_frozen(
    &self,
    artifact_id: &str,
    frozen: bool,
  ) -> Result<(), CloudSaveError> {
    let artifact_id_json = format!("{artifact_id}.json");
    // Find metadata file
    let meta_root = self.root.join("_metadata");
    let mut found_meta: Option<PathBuf> = None;
    if let Ok(entries) = std::fs::read_dir(&meta_root) {
      for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
          let candidate = path.join(&artifact_id_json);
          if candidate.exists() {
            found_meta = Some(candidate);
            break;
          }
        }
      }
    }
    let meta_path = found_meta.ok_or_else(|| CloudSaveError {
      message: format!("metadata for {artifact_id} not found"),
    })?;
    let mut meta = self
      .read_metadata_file(&meta_path)
      .ok_or_else(|| CloudSaveError { message: "metadata parse failed".to_string() })?;
    meta.is_frozen = frozen;
    self.write_metadata_file(&meta_path, &meta)?;
    Ok(())
  }

  async fn test_connection(&self) -> Result<String, CloudSaveError> {
    if self.root.exists() && self.root.is_dir() {
      Ok(format!("Local folder OK: {}", self.root.display()))
    } else {
      Err(CloudSaveError {
        message: format!("folder does not exist: {}", self.root.display()),
      })
    }
  }
}
