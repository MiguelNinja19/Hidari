//! WebDAV backend.
//!
//! Uses WebDAV HTTP methods (PROPFIND, PUT, GET, DELETE, MKCOL) to store
//! tar files on a remote WebDAV server.
//!
//! Folder structure mirrors the local backend:
//! ```text
//! <webdav_root>/hidari-cloud-save/
//! ├── {shop}_{object_id}/
//! │   ├── {artifact_id}.tar
//! │   └── {artifact_id}.json
//! ```
//!
//! Compatible with: Nextcloud, ownCloud, Synology NAS, pCloud, Box.com,
//! Apache/Nginx with mod_dav.

use super::backend::CloudSaveBackend;
use super::{ArtifactMetadata, CloudSaveError, UploadResult};
use async_trait::async_trait;
use reqwest::Client;
use std::path::Path;

pub struct WebdavBackend {
  client: Client,
  base_url: String,
  username: String,
  password: String,
  /// Subfolder under the WebDAV root. Defaults to "hidari-cloud-save".
  root_folder: String,
}

impl WebdavBackend {
  pub fn new(url: &str, username: &str, password: &str) -> Result<Self, CloudSaveError> {
    let client = Client::builder()
      .timeout(std::time::Duration::from_secs(60))
      .build()
      .map_err(|e| CloudSaveError { message: format!("client build: {e}") })?;
    Ok(Self {
      client,
      base_url: url.trim_end_matches('/').to_string(),
      username: username.to_string(),
      password: password.to_string(),
      root_folder: "hidari-cloud-save".to_string(),
    })
  }

  fn game_url(&self, shop: &str, object_id: &str) -> String {
    format!(
      "{}/{}/{}_{}",
      self.base_url,
      self.root_folder,
      shop,
      object_id
    )
  }

  fn artifact_url(&self, shop: &str, object_id: &str, artifact_id: &str, ext: &str) -> String {
    format!("{}{}.{}", self.game_url(shop, object_id), artifact_id, ext)
  }

  fn hostname() -> String {
    std::env::var("HOSTNAME")
      .or_else(|_| std::env::var("COMPUTERNAME"))
      .unwrap_or_else(|_| "unknown".to_string())
  }

  async fn ensure_root_exists(&self) -> Result<(), CloudSaveError> {
    // Create root folder if not exists (MKCOL is idempotent in our usage — ignore 405/409)
    let root_url = format!("{}/{}", self.base_url, self.root_folder);
    let _ = self
      .client
      .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), &root_url)
      .basic_auth(&self.username, Some(&self.password))
      .send()
      .await;
    Ok(())
  }

  async fn ensure_game_folder(&self, shop: &str, object_id: &str) -> Result<(), CloudSaveError> {
    self.ensure_root_exists().await?;
    let game_url = self.game_url(shop, object_id);
    let _ = self
      .client
      .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), &game_url)
      .basic_auth(&self.username, Some(&self.password))
      .send()
      .await;
    Ok(())
  }
}

#[async_trait]
impl CloudSaveBackend for WebdavBackend {
  async fn list_artifacts(
    &self,
    shop: &str,
    object_id: &str,
  ) -> Result<Vec<ArtifactMetadata>, CloudSaveError> {
    let game_url = self.game_url(shop, object_id);
    // PROPFIND to list folder contents
    let resp = self
      .client
      .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &game_url)
      .basic_auth(&self.username, Some(&self.password))
      .header("Depth", "1")
      .header("Content-Type", "application/xml")
      .body(r#"<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/></prop></propfind>"#)
      .send()
      .await?;

    if !resp.status().is_success() && resp.status().as_u16() != 207 {
      return Ok(Vec::new()); // Folder doesn't exist or empty
    }

    let body = resp.text().await?;
    // Parse XML to find .json files (metadata)
    // Simple regex-style parse for href entries
    let mut artifacts = Vec::new();
    let mut hrefs: Vec<String> = Vec::new();
    let mut in_href = false;
    let mut current_href = String::new();
    for token in body.split(['<', '>']) {
      if token.starts_with("d:href") || token.starts_with("D:href") || token == "href" || token.starts_with("href ") {
        in_href = true;
        current_href.clear();
      } else if token == "/href" || token.starts_with("/d:href") || token.starts_with("/D:href") {
        if in_href && !current_href.is_empty() {
          hrefs.push(current_href.clone());
        }
        in_href = false;
      } else if in_href {
        current_href.push_str(token);
      }
    }

    // Fetch each .json metadata file
    for href in &hrefs {
      if href.ends_with(".json") {
        let url = if href.starts_with("http") {
          href.clone()
        } else {
          // Relative URL — prepend base
          let trimmed = href.trim_start_matches('/');
          format!("{}/{}", self.base_url, trimmed)
        };
        let resp = self
          .client
          .get(&url)
          .basic_auth(&self.username, Some(&self.password))
          .send()
          .await;
        if let Ok(resp) = resp {
          if resp.status().is_success() {
            if let Ok(meta) = resp.json::<ArtifactMetadata>().await {
              artifacts.push(meta);
            }
          }
        }
      }
    }

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
    self.ensure_game_folder(shop, object_id).await?;

    let size = std::fs::metadata(tar_path)?.len();
    let now = chrono::Utc::now().timestamp();
    let artifact_id = format!("{now}");

    // Upload tar file
    let tar_url = self.artifact_url(shop, object_id, &artifact_id, "tar");
    let tar_bytes = std::fs::read(tar_path)?;
    let resp = self
      .client
      .put(&tar_url)
      .basic_auth(&self.username, Some(&self.password))
      .header("Content-Type", "application/tar")
      .body(tar_bytes)
      .send()
      .await?;
    if !resp.status().is_success() {
      return Err(CloudSaveError {
        message: format!("upload tar failed: HTTP {}", resp.status()),
      });
    }

    // Upload metadata
    let meta = ArtifactMetadata {
      id: artifact_id.clone(),
      label: label.to_string(),
      size_bytes: size,
      created_at: now,
      hostname: Self::hostname(),
      is_frozen: false,
    };
    let meta_url = self.artifact_url(shop, object_id, &artifact_id, "json");
    let resp = self
      .client
      .put(&meta_url)
      .basic_auth(&self.username, Some(&self.password))
      .header("Content-Type", "application/json")
      .json(&meta)
      .send()
      .await?;
    if !resp.status().is_success() {
      return Err(CloudSaveError {
        message: format!("upload metadata failed: HTTP {}", resp.status()),
      });
    }

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
    // We need to find the (shop, object_id) for this artifact_id.
    // For simplicity, we search all game folders.
    // In practice, the frontend should pass shop+object_id too.
    //
    // For now, this is a simplified implementation that assumes the caller
    // passes a URL containing the game folder in the artifact_id
    // (e.g., "steam_123456/1699999999"). If not found, returns error.

    // Try direct URL construction if artifact_id contains a slash
    if let Some(slash_pos) = artifact_id.find('/') {
      let game_folder = &artifact_id[..slash_pos];
      let id = &artifact_id[slash_pos + 1..];
      let url = format!("{}/{}/{}/{}.tar", self.base_url, self.root_folder, game_folder, id);
      let resp = self
        .client
        .get(&url)
        .basic_auth(&self.username, Some(&self.password))
        .send()
        .await?;
      if resp.status().is_success() {
        let bytes = resp.bytes().await?;
        std::fs::write(dest_path, &bytes)?;
        return Ok(());
      }
    }
    Err(CloudSaveError {
      message: format!("artifact {artifact_id} not found (must include game folder)"),
    })
  }

  async fn delete_artifact(&self, artifact_id: &str) -> Result<(), CloudSaveError> {
    // Same assumption as download: artifact_id = "game_folder/id"
    if let Some(slash_pos) = artifact_id.find('/') {
      let game_folder = &artifact_id[..slash_pos];
      let id = &artifact_id[slash_pos + 1..];

      // Delete tar
      let tar_url = format!("{}/{}/{}/{}.tar", self.base_url, self.root_folder, game_folder, id);
      let _ = self
        .client
        .delete(&tar_url)
        .basic_auth(&self.username, Some(&self.password))
        .send()
        .await;

      // Delete json
      let json_url = format!("{}/{}/{}/{}.json", self.base_url, self.root_folder, game_folder, id);
      let _ = self
        .client
        .delete(&json_url)
        .basic_auth(&self.username, Some(&self.password))
        .send()
        .await;

      return Ok(());
    }
    Err(CloudSaveError {
      message: format!("artifact {artifact_id} format invalid (must include game folder)"),
    })
  }

  async fn set_artifact_frozen(
    &self,
    _artifact_id: &str,
    _frozen: bool,
  ) -> Result<(), CloudSaveError> {
    // For WebDAV, we'd need to fetch the metadata, update, and re-upload.
    // Simplified for v1: not implemented.
    Err(CloudSaveError {
      message: "freeze not implemented for WebDAV backend".to_string(),
    })
  }

  async fn test_connection(&self) -> Result<String, CloudSaveError> {
    let resp = self
      .client
      .request(reqwest::Method::OPTIONS, &self.base_url)
      .basic_auth(&self.username, Some(&self.password))
      .send()
      .await?;
    if resp.status().is_success() {
      Ok(format!("WebDAV connection OK: {}", self.base_url))
    } else {
      Err(CloudSaveError {
        message: format!("HTTP {}", resp.status()),
      })
    }
  }
}
