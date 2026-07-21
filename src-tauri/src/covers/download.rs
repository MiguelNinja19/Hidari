use crate::db::open_database_connection;
use rusqlite::params;
use std::collections::HashSet;
use std::hash::{DefaultHasher, Hash, Hasher};
use tauri::AppHandle;
use tokio::time::{sleep, Duration};

pub fn cover_download_urls(cover_url: &str) -> Vec<String> {
  let url = cover_url.trim();
  let mut urls = Vec::new();
  if let Some(app_id) = url
    .split("/steam/apps/")
    .nth(1)
    .and_then(|rest| rest.split('/').next())
    .filter(|id| !id.is_empty())
  {
    urls.extend(crate::config::steam_library_cover_urls(app_id));
  }
  urls.push(url.to_string());
  let mut seen = HashSet::new();
  urls.retain(|item| seen.insert(item.clone()));
  urls
}

pub async fn fetch_cover_bytes(client: &reqwest::Client, url: &str) -> Option<Vec<u8>> {
  for attempt in 0..2 {
    match client.get(url).send().await {
      Ok(response) if response.status().is_success() => {
        let bytes = response.bytes().await.ok()?;
        if super::is_valid_cover_bytes(&bytes) {
          return Some(bytes.to_vec());
        }
      }
      Ok(response) if !response.status().is_server_error() && response.status().as_u16() != 429 => {
        break;
      }
      _ => {}
    }
    sleep(Duration::from_millis(350 * (attempt + 1))).await;
  }
  None
}

pub async fn download_and_cache_cover(
  app: &AppHandle,
  title: &str,
  cover_url: &str,
) -> Result<Option<String>, String> {
  let key = crate::title::cover_storage_key(title);
  if key.is_empty() {
    return Ok(None);
  }
  let dir = super::covers_dir_for_app(app)?;
  let mut hasher = DefaultHasher::new();
  key.hash(&mut hasher);
  cover_url.hash(&mut hasher);
  let path = dir.join(format!("{:x}.jpg", hasher.finish()));
  if path.exists() && !super::is_usable_cover_file(&path, &dir) {
    super::remove_cover_file(&path.to_string_lossy());
  }
  if !super::is_usable_cover_file(&path, &dir) {
    let client = reqwest::Client::builder()
      .timeout(Duration::from_secs(20))
      .user_agent("Hidari/1.0")
      .build()
      .map_err(|error| format!("could_not_create_http_client: {error}"))?;
    let mut downloaded = None;
    for url in cover_download_urls(cover_url) {
      if let Some(bytes) = fetch_cover_bytes(&client, &url).await {
        downloaded = Some(bytes);
        break;
      }
    }
    let Some(bytes) = downloaded else { return Ok(None) };
    std::fs::write(&path, bytes)
      .map_err(|error| format!("could_not_write_cover_cache: {error}"))?;
  }
  let local = path.to_string_lossy().to_string();
  open_database_connection(app)?.execute(
    "UPDATE game_covers SET local_path=?1,updated_at=CURRENT_TIMESTAMP WHERE title_key=?2",
    params![local, key],
  ).map_err(|error| format!("could_not_update_cover_local_path: {error}"))?;
  Ok(Some(local))
}
