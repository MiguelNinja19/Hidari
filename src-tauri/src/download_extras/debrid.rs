//! Debrid service clients.
//!
//! Each debrid service takes a magnet link or hoster URL and returns
//! a direct HTTP download URL (cached on their servers).

use super::{DebridCredentials, DebridService, DownloadExtrasError, ResolvedDownload};
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;

const TIMEOUT_SECS: u64 = 30;

fn build_client() -> Result<Client, DownloadExtrasError> {
  Client::builder()
    .timeout(Duration::from_secs(TIMEOUT_SECS))
    .user_agent(concat!("Hidari/", env!("CARGO_PKG_VERSION")))
    .build()
    .map_err(|e| DownloadExtrasError {
      message: format!("client build: {e}"),
    })
}

// =====================
// Real-Debrid
// =====================

const RD_API: &str = "https://api.real-debrid.com/rest/1.0";

#[derive(Deserialize)]
struct RdTorrentAdd {
  id: String,
}

#[derive(Deserialize)]
struct RdTorrentInfo {
  status: String,
  #[serde(default)]
  links: Vec<String>,
}

#[derive(Deserialize)]
struct RdUnrestrict {
  download: String,
}

/// Resolve a magnet or URL via Real-Debrid.
pub async fn resolve_real_debrid(
  magnet_or_url: &str,
  api_token: &str,
) -> Result<ResolvedDownload, DownloadExtrasError> {
  let client = build_client()?;
  let auth_header = format!("Bearer {api_token}");

  // If it's a magnet, we need to: addMagnet → selectFiles → poll → unrestrictLink
  // If it's a hoster URL, we just unrestrictLink directly.
  if super::is_magnet(magnet_or_url) {
    // Step 1: addMagnet
    let resp = client
      .post(format!("{RD_API}/torrents/addMagnet"))
      .header("Authorization", &auth_header)
      .form(&[("magnet", magnet_or_url)])
      .send()
      .await?;
    if !resp.status().is_success() {
      return Err(DownloadExtrasError {
        message: format!("RD addMagnet failed: HTTP {}", resp.status()),
      });
    }
    let torrent: RdTorrentAdd = resp.json().await?;

    // Step 2: select all files
    let _ = client
      .post(format!("{RD_API}/torrents/selectFiles/{}", torrent.id))
      .header("Authorization", &auth_header)
      .form(&[("files", "all")])
      .send()
      .await?;

    // Step 3: poll until downloaded (max 5 min)
    let mut attempts = 0;
    let max_attempts = 60; // 60 × 5s = 5 min
    let mut torrent_info: Option<RdTorrentInfo> = None;
    while attempts < max_attempts {
      let resp = client
        .get(format!("{RD_API}/torrents/info/{}", torrent.id))
        .header("Authorization", &auth_header)
        .send()
        .await?;
      if resp.status().is_success() {
        let info: RdTorrentInfo = resp.json().await?;
        if info.status == "downloaded" {
          torrent_info = Some(info);
          break;
        }
      }
      tokio::time::sleep(Duration::from_secs(5)).await;
      attempts += 1;
    }

    let info = torrent_info.ok_or_else(|| DownloadExtrasError {
      message: "RD torrent did not finish downloading within 5 minutes".to_string(),
    })?;

    let first_link = info
      .links
      .into_iter()
      .next()
      .ok_or_else(|| DownloadExtrasError {
        message: "RD torrent has no download links".to_string(),
      })?;

    // Step 4: unrestrict link
    let resp = client
      .post(format!("{RD_API}/unrestrict/link"))
      .header("Authorization", &auth_header)
      .form(&[("link", &first_link)])
      .send()
      .await?;
    if !resp.status().is_success() {
      return Err(DownloadExtrasError {
        message: format!("RD unrestrict failed: HTTP {}", resp.status()),
      });
    }
    let unrestrict: RdUnrestrict = resp.json().await?;
    Ok(ResolvedDownload {
      download_url: unrestrict.download,
      filename: None,
      file_size: None,
      resolved_by: DebridService::RealDebrid.label().to_string(),
    })
  } else {
    // Hoster URL — unrestrict directly
    let resp = client
      .post(format!("{RD_API}/unrestrict/link"))
      .header("Authorization", &auth_header)
      .form(&[("link", magnet_or_url)])
      .send()
      .await?;
    if !resp.status().is_success() {
      return Err(DownloadExtrasError {
        message: format!("RD unrestrict failed: HTTP {}", resp.status()),
      });
    }
    let unrestrict: RdUnrestrict = resp.json().await?;
    Ok(ResolvedDownload {
      download_url: unrestrict.download,
      filename: None,
      file_size: None,
      resolved_by: DebridService::RealDebrid.label().to_string(),
    })
  }
}

// =====================
// AllDebrid
// =====================

const AD_API: &str = "https://api.alldebrid.com/v4";

#[derive(Deserialize)]
struct AdResponse<T> {
  data: T,
}

#[derive(Deserialize)]
struct AdMagnetUpload {
  magnets: Vec<AdMagnetEntry>,
}

#[derive(Deserialize)]
struct AdMagnetEntry {
  id: String,
}

#[derive(Deserialize)]
struct AdMagnetStatus {
  magnets: Vec<AdMagnetStatusEntry>,
}

#[derive(Deserialize)]
struct AdMagnetStatusEntry {
  status: String,
  #[serde(default)]
  links: Vec<AdLink>,
}

#[derive(Deserialize)]
struct AdLink {
  link: String,
  filename: Option<String>,
  size: Option<u64>,
}

#[derive(Deserialize)]
struct AdUnlock {
  link: String,
  filename: Option<String>,
  size: Option<u64>,
}

/// Resolve via AllDebrid.
pub async fn resolve_all_debrid(
  magnet_or_url: &str,
  api_token: &str,
) -> Result<ResolvedDownload, DownloadExtrasError> {
  let client = build_client()?;
  let agent = format!("Hidari/{}", env!("CARGO_PKG_VERSION"));

  if super::is_magnet(magnet_or_url) {
    // Upload magnet
    let resp = client
      .get(format!("{AD_API}/magnet/upload"))
      .query(&[("agent", &agent), ("apikey", &api_token.to_string()), ("magnets[]", &magnet_or_url.to_string())])
      .send()
      .await?;
    if !resp.status().is_success() {
      return Err(DownloadExtrasError {
        message: format!("AD upload failed: HTTP {}", resp.status()),
      });
    }
    let body: AdResponse<AdMagnetUpload> = resp.json().await?;
    let magnet_id = body
      .data
      .magnets
      .into_iter()
      .next()
      .ok_or_else(|| DownloadExtrasError {
        message: "AD returned no magnet id".to_string(),
      })?
      .id;

    // Poll until ready
    let mut attempts = 0;
    let max_attempts = 60;
    let mut ready_link: Option<AdLink> = None;
    while attempts < max_attempts {
      let resp = client
        .get(format!("{AD_API}/magnet/status"))
        .query(&[("agent", &agent), ("apikey", &api_token.to_string()), ("id", &magnet_id)])
        .send()
        .await?;
      if resp.status().is_success() {
        let body: AdResponse<AdMagnetStatus> = resp.json().await?;
        if let Some(entry) = body.data.magnets.into_iter().next() {
          if entry.status == "Ready" {
            ready_link = entry.links.into_iter().next();
            break;
          }
        }
      }
      tokio::time::sleep(Duration::from_secs(5)).await;
      attempts += 1;
    }

    let link = ready_link.ok_or_else(|| DownloadExtrasError {
      message: "AD magnet did not finish within 5 minutes".to_string(),
    })?;

    // Unlock the link
    let resp = client
      .get(format!("{AD_API}/link/unlock"))
      .query(&[("agent", &agent), ("apikey", &api_token.to_string()), ("link", &link.link)])
      .send()
      .await?;
    if !resp.status().is_success() {
      return Err(DownloadExtrasError {
        message: format!("AD unlock failed: HTTP {}", resp.status()),
      });
    }
    let body: AdResponse<AdUnlock> = resp.json().await?;
    Ok(ResolvedDownload {
      download_url: body.data.link,
      filename: body.data.filename,
      file_size: body.data.size,
      resolved_by: DebridService::AllDebrid.label().to_string(),
    })
  } else {
    // Hoster URL — unlock directly
    let resp = client
      .get(format!("{AD_API}/link/unlock"))
      .query(&[
        ("agent", &agent),
        ("apikey", &api_token.to_string()),
        ("link", &magnet_or_url.to_string()),
      ])
      .send()
      .await?;
    if !resp.status().is_success() {
      return Err(DownloadExtrasError {
        message: format!("AD unlock failed: HTTP {}", resp.status()),
      });
    }
    let body: AdResponse<AdUnlock> = resp.json().await?;
    Ok(ResolvedDownload {
      download_url: body.data.link,
      filename: body.data.filename,
      file_size: body.data.size,
      resolved_by: DebridService::AllDebrid.label().to_string(),
    })
  }
}

// =====================
// TorBox (simplified)
// =====================

const TB_API: &str = "https://api.torbox.app/v1/api";

/// Resolve via TorBox (simplified — only direct unrestrict for hoster URLs).
/// Full magnet flow not implemented for v1.
pub async fn resolve_torbox(
  url: &str,
  api_token: &str,
) -> Result<ResolvedDownload, DownloadExtrasError> {
  // For now, only return the URL as-is — TorBox requires complex torrent flow.
  // Future improvement: implement createTorrent + requestDL flow.
  Err(DownloadExtrasError {
    message: format!("TorBox resolver not yet implemented for URL: {url} (token: {api_token})"),
  })
}

// =====================
// Premiumize (simplified)
// =====================

/// Resolve via Premiumize (simplified).
pub async fn resolve_premiumize(
  _magnet_or_url: &str,
  _api_token: &str,
) -> Result<ResolvedDownload, DownloadExtrasError> {
  Err(DownloadExtrasError {
    message: "Premiumize resolver not yet implemented".to_string(),
  })
}

/// Dispatch to the right resolver based on service type.
pub async fn resolve(
  service: DebridService,
  magnet_or_url: &str,
  credentials: &DebridCredentials,
) -> Result<ResolvedDownload, DownloadExtrasError> {
  match service {
    DebridService::RealDebrid => {
      let token = credentials
        .real_debrid_token
        .as_ref()
        .ok_or_else(|| DownloadExtrasError {
          message: "Real-Debrid API token not set".to_string(),
        })?;
      resolve_real_debrid(magnet_or_url, token).await
    }
    DebridService::AllDebrid => {
      let token = credentials
        .all_debrid_token
        .as_ref()
        .ok_or_else(|| DownloadExtrasError {
          message: "AllDebrid API token not set".to_string(),
        })?;
      resolve_all_debrid(magnet_or_url, token).await
    }
    DebridService::TorBox => {
      let token = credentials
        .torbox_token
        .as_ref()
        .ok_or_else(|| DownloadExtrasError {
          message: "TorBox API token not set".to_string(),
        })?;
      resolve_torbox(magnet_or_url, token).await
    }
    DebridService::Premiumize => {
      let token = credentials
        .premiumize_token
        .as_ref()
        .ok_or_else(|| DownloadExtrasError {
          message: "Premiumize API token not set".to_string(),
        })?;
      resolve_premiumize(magnet_or_url, token).await
    }
  }
}
