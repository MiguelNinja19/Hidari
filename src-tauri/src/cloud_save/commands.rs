//! Tauri IPC commands for Cloud Save.

use super::backend::CloudSaveBackend;
use super::local_backend::LocalBackend;
use super::webdav_backend::WebdavBackend;
use super::{ArtifactMetadata, CloudSaveError, CloudSaveSettings, UploadResult};
use super::tar_util;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, State};
/// Tauri-managed state holding the active backend and settings.
pub struct CloudSaveState {
  pub settings: std::sync::Mutex<CloudSaveSettings>,
}

impl Default for CloudSaveState {
  fn default() -> Self {
    Self {
      settings: std::sync::Mutex::new(CloudSaveSettings::default()),
    }
  }
}

#[derive(Debug, Serialize)]
pub struct CloudSaveCommandError {
  pub message: String,
}

impl From<CloudSaveError> for CloudSaveCommandError {
  fn from(e: CloudSaveError) -> Self {
    CloudSaveCommandError { message: e.message }
  }
}

impl From<String> for CloudSaveCommandError {
  fn from(s: String) -> Self {
    CloudSaveCommandError { message: s }
  }
}

type ApiResult<T> = Result<T, CloudSaveCommandError>;

/// Read settings from state and build a backend.
/// The MutexGuard is dropped inside this function (via the block scope)
/// so it never crosses an `.await` boundary (which would make the future !Send).
fn build_backend_from_state(state: &State<'_, CloudSaveState>) -> Result<Box<dyn CloudSaveBackend>, CloudSaveCommandError> {
  let settings = state.settings.lock().map_err(|e| CloudSaveCommandError {
    message: format!("lock error: {e}"),
  })?;
  build_backend(&settings).map_err(CloudSaveCommandError::from)
}

/// Build the active backend from current settings.
fn build_backend(settings: &CloudSaveSettings) -> Result<Box<dyn CloudSaveBackend>, CloudSaveError> {
  match settings.backend {
    super::BackendType::Local => {
      let folder = settings.local_folder.as_ref().ok_or_else(|| CloudSaveError {
        message: "local_folder not set".to_string(),
      })?;
      Ok(Box::new(LocalBackend::new(PathBuf::from(folder))?))
    }
    super::BackendType::Webdav => {
      let url = settings.webdav_url.as_ref().ok_or_else(|| CloudSaveError {
        message: "webdav_url not set".to_string(),
      })?;
      let username = settings.webdav_username.as_deref().unwrap_or("");
      let password = settings.webdav_password.as_deref().unwrap_or("");
      Ok(Box::new(WebdavBackend::new(url, username, password)?))
    }
    super::BackendType::Hydra => Err(CloudSaveError {
      message: "Hydra backend not yet implemented. Use Local or WebDAV.".to_string(),
    }),
  }
}

/// Get current cloud save settings.
#[tauri::command]
pub async fn get_cloud_save_settings(
  state: State<'_, CloudSaveState>,
) -> ApiResult<CloudSaveSettings> {
  let settings = state.settings.lock().map_err(|e| CloudSaveCommandError {
    message: format!("lock error: {e}"),
  })?;
  Ok(settings.clone())
}

/// Update cloud save settings.
#[tauri::command]
pub async fn set_cloud_save_settings(
  settings: CloudSaveSettings,
  state: State<'_, CloudSaveState>,
) -> ApiResult<()> {
  let mut current = state.settings.lock().map_err(|e| CloudSaveCommandError {
    message: format!("lock error: {e}"),
  })?;
  *current = settings;
  Ok(())
}

/// Test the active backend connection.
#[tauri::command]
pub async fn test_cloud_save_connection(
  state: State<'_, CloudSaveState>,
) -> ApiResult<String> {
  let backend = build_backend_from_state(&state)?;
  let result = backend.test_connection().await?;
  Ok(result)
}

/// List all artifacts stored for a game.
#[tauri::command]
pub async fn list_cloud_save_artifacts(
  shop: String,
  object_id: String,
  state: State<'_, CloudSaveState>,
) -> ApiResult<Vec<ArtifactMetadata>> {
  let backend = build_backend_from_state(&state)?;
  let artifacts = backend.list_artifacts(&shop, &object_id).await?;
  Ok(artifacts)
}

/// Create a backup of a save folder and upload it.
#[tauri::command]
pub async fn upload_cloud_save(
  shop: String,
  object_id: String,
  save_folder_path: String,
  label: String,
  state: State<'_, CloudSaveState>,
) -> ApiResult<UploadResult> {
  let backend = build_backend_from_state(&state)?;

  let save_path = std::path::Path::new(&save_folder_path);
  if !save_path.is_dir() {
    return Err(CloudSaveCommandError {
      message: format!("save folder does not exist: {save_folder_path}"),
    });
  }

  // Create tar in temp dir
  let temp_dir = std::env::temp_dir().join("hidari-cloud-save-tmp");
  std::fs::create_dir_all(&temp_dir).map_err(|e| CloudSaveCommandError {
    message: format!("create temp dir: {e}"),
  })?;
  let tar_path = temp_dir.join(format!("{}-{}.tar", shop, object_id.replace('/', "_")));
  let _size = tar_util::create_tar(save_path, &tar_path)?;

  let result = backend
    .upload_artifact(&shop, &object_id, &tar_path, &label)
    .await?;

  // Cleanup temp tar
  let _ = std::fs::remove_file(&tar_path);

  Ok(result)
}

/// Download a cloud save artifact to a local path.
#[tauri::command]
pub async fn download_cloud_save(
  artifact_id: String,
  dest_path: String,
  state: State<'_, CloudSaveState>,
) -> ApiResult<()> {
  let backend = build_backend_from_state(&state)?;
  backend
    .download_artifact(&artifact_id, std::path::Path::new(&dest_path))
    .await?;
  Ok(())
}

/// Restore a cloud save: download artifact + extract to save folder.
#[tauri::command]
pub async fn restore_cloud_save(
  artifact_id: String,
  shop: String,
  object_id: String,
  save_folder_path: String,
  state: State<'_, CloudSaveState>,
) -> ApiResult<()> {
  let backend = build_backend_from_state(&state)?;

  // Download to temp
  let temp_dir = std::env::temp_dir().join("hidari-cloud-save-restore");
  std::fs::create_dir_all(&temp_dir).map_err(|e| CloudSaveCommandError {
    message: format!("temp dir: {e}"),
  })?;
  let tar_path = temp_dir.join(format!("restore-{}.tar", artifact_id.replace('/', "_")));

  // Compose full artifact_id with game folder for WebDAV backend
  let full_artifact_id = if artifact_id.contains('/') {
    artifact_id.clone()
  } else {
    format!("{}_{}/{}", shop, object_id, artifact_id)
  };

  backend.download_artifact(&full_artifact_id, &tar_path).await?;

  // Extract to save folder
  let save_path = std::path::Path::new(&save_folder_path);
  if save_path.exists() {
    // Backup current save folder before overwrite
    let backup_path = format!("{}.before-restore.{}", save_folder_path, chrono::Utc::now().timestamp());
    std::fs::rename(save_path, &backup_path).map_err(|e| CloudSaveCommandError {
      message: format!("backup existing save folder: {e}"),
    })?;
  }
  std::fs::create_dir_all(save_path).map_err(|e| CloudSaveCommandError {
    message: format!("create save folder: {e}"),
  })?;

  tar_util::extract_tar(&tar_path, save_path)?;

  // Cleanup temp tar
  let _ = std::fs::remove_file(&tar_path);

  Ok(())
}

/// Delete a cloud save artifact.
#[tauri::command]
pub async fn delete_cloud_save(
  artifact_id: String,
  shop: String,
  object_id: String,
  state: State<'_, CloudSaveState>,
) -> ApiResult<()> {
  let backend = build_backend_from_state(&state)?;

  let full_artifact_id = if artifact_id.contains('/') {
    artifact_id
  } else {
    format!("{}_{}/{}", shop, object_id, artifact_id)
  };

  backend.delete_artifact(&full_artifact_id).await?;
  Ok(())
}

/// Toggle the frozen state of an artifact.
#[tauri::command]
pub async fn set_cloud_save_frozen(
  artifact_id: String,
  frozen: bool,
  state: State<'_, CloudSaveState>,
) -> ApiResult<()> {
  let backend = build_backend_from_state(&state)?;
  backend.set_artifact_frozen(&artifact_id, frozen).await?;
  Ok(())
}

/// Select a save folder via Tauri dialog (helper for the UI).
#[tauri::command]
pub async fn select_save_folder(app: AppHandle) -> ApiResult<Option<String>> {
  use tauri_plugin_dialog::DialogExt;
  let folder = app
    .dialog()
    .file()
    .set_title("Selecione a pasta de save do jogo")
    .blocking_pick_folder();
  // blocking_pick_folder returns Option<FilePath> in Tauri 2.
  // FilePath can be Path(PathBuf) or Url. We convert to string.
  Ok(folder.map(|p| p.to_string()))
}
