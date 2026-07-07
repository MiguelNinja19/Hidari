pub mod hydra;
pub mod hydralinks;

pub use hydra::*;
pub use hydralinks::*;

use crate::config;
use crate::db::open_database_connection;
use crate::dto::{
  DownloadOptionDto, HydraSourceDto, SourceEntry, SourceOptionItem, SourceSearchResponse,
};
use rusqlite::{params, Connection};
use tauri::AppHandle;
use tokio::time::Duration;
use url::Url;

pub fn validate_source_url(value: &str) -> Result<(), String> {
  if is_local_catalog_path(value) {
    return Ok(());
  }
  let parsed = Url::parse(value).map_err(|_| "invalid_source_url".to_string())?;
  let scheme = parsed.scheme();
  if scheme != "http" && scheme != "https" {
    return Err("source_url_must_be_http_or_https".to_string());
  }
  Ok(())
}

pub fn validate_job_url(value: &str) -> Result<(), String> {
  let parsed = Url::parse(value).map_err(|_| "invalid_job_url".to_string())?;
  if !matches!(parsed.scheme(), "http" | "https" | "magnet") {
    return Err("job_url_must_be_http_https_or_magnet".to_string());
  }
  if parsed.scheme() == "magnet" {
    let has_btih = parsed
      .query_pairs()
      .any(|(key, val)| key == "xt" && val.to_ascii_lowercase().starts_with("urn:btih:"));
    if !has_btih {
      return Err("invalid_magnet_missing_btih".to_string());
    }
  }
  Ok(())
}
fn percent_encode_tracker(tracker: &str) -> String {
  let mut out = String::with_capacity(tracker.len() + 8);
  for byte in tracker.bytes() {
    match byte {
      b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
        out.push(byte as char);
      }
      _ => out.push_str(&format!("%{byte:02X}")),
    }
  }
  out
}

/// Adds public trackers to magnet links with few or no trackers (speeds up metadata fetch).
pub fn enrich_magnet_url(raw: &str) -> String {
  if !raw.to_ascii_lowercase().starts_with("magnet:?") {
    return raw.to_string();
  }

  let lower = raw.to_lowercase();
  let tracker_count = lower.matches("&tr=").count() + if lower.contains("?tr=") { 1 } else { 0 };
  if tracker_count >= 6 {
    return raw.to_string();
  }

  let mut enriched = raw.to_string();
  for tracker in config::DEFAULT_MAGNET_TRACKERS {
    if lower.contains(&tracker.to_lowercase()) {
      continue;
    }
    enriched.push_str("&tr=");
    enriched.push_str(&percent_encode_tracker(tracker));
  }
  enriched
}
pub fn load_sources(conn: &Connection) -> Result<Vec<SourceEntry>, String> {
  let mut stmt = conn
    .prepare("SELECT id, name, base_url FROM download_sources ORDER BY id ASC")
    .map_err(|error| format!("could_not_prepare_sources_query: {error}"))?;
  let result = stmt
    .query_map([], |row| {
      Ok(SourceEntry {
        id: row.get(0)?,
        name: row.get(1)?,
        base_url: row.get(2)?,
      })
    })
    .map_err(|error| format!("could_not_query_sources: {error}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| format!("could_not_map_sources: {error}"));
  result
}

pub fn load_source_by_id(conn: &Connection, id: i64) -> Result<SourceEntry, String> {
  conn
    .query_row(
      "SELECT id, name, base_url FROM download_sources WHERE id = ?1",
      params![id],
      |row| {
        Ok(SourceEntry {
          id: row.get(0)?,
          name: row.get(1)?,
          base_url: row.get(2)?,
        })
      },
    )
    .map_err(|error| format!("could_not_load_source_by_id: {error}"))
}

pub fn set_source_status(app: &AppHandle, source_id: i64, status: &str) {
  if let Ok(conn) = open_database_connection(app) {
    let _ = conn.execute(
      "UPDATE download_sources SET status = ?1 WHERE id = ?2",
      params![status, source_id],
    );
  }
}
pub async fn fetch_options_from_sources(
  app: &AppHandle,
  game_id: i64,
  game_title: &str,
  sources: &[SourceEntry],
) -> Vec<DownloadOptionDto> {
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(12))
    .build()
    .unwrap_or_else(|_| reqwest::Client::new());

  let mut options: Vec<DownloadOptionDto> = Vec::new();

  for source in sources {
    let base = source.base_url.trim_end_matches('/');
    let response = client
      .get(format!("{base}/search"))
      .query(&[
        ("query", game_title.to_string()),
        ("gameId", game_id.to_string()),
      ])
      .send()
      .await;

    let resp = match response {
      Ok(resp) => resp,
      Err(_) => {
        set_source_status(app, source.id, "failed");
        continue;
      }
    };

    if !resp.status().is_success() {
      set_source_status(app, source.id, "failed");
      continue;
    }

    let parsed_items: Vec<SourceOptionItem> = match resp.json::<Vec<SourceOptionItem>>().await {
      Ok(list) => list,
      Err(_) => {
        // tenta o formato { options: [...] } como fallback
        let fallback = client
          .get(format!("{base}/search"))
          .query(&[
            ("query", game_title.to_string()),
            ("gameId", game_id.to_string()),
          ])
          .send()
          .await;
        let Ok(fallback_resp) = fallback else {
          set_source_status(app, source.id, "failed");
          continue;
        };
        match fallback_resp.json::<SourceSearchResponse>().await {
          Ok(wrapper) => wrapper.options,
          Err(_) => {
            set_source_status(app, source.id, "failed");
            continue;
          }
        }
      }
    };

    set_source_status(app, source.id, "active");
    for item in parsed_items {
      let title = item
        .title
        .clone()
        .unwrap_or_else(|| format!("{} ({})", game_title, source.name));
      options.push(DownloadOptionDto {
        source_id: source.id.to_string(),
        source_name: source.name.clone(),
        title,
        download_type: item.download_type.unwrap_or_else(|| "http".to_string()),
        url: item.url,
        quality: item.quality.unwrap_or_else(|| "standard".to_string()),
        cover_url: None,
      });
    }
  }

  options
}

pub async fn search_download_options_from_local_sources(
  app: &AppHandle,
  query: &str,
  sources: &[HydraSourceDto],
) -> Vec<DownloadOptionDto> {
  let app = app.clone();
  let query = query.to_string();
  let active: Vec<HydraSourceDto> = sources
    .iter()
    .filter(|source| is_json_catalog_source(&source.url) || has_local_catalog(&app, &source.id))
    .cloned()
    .collect();

  if active.is_empty() {
    return Vec::new();
  }

  if active.len() == 1 {
    return search_json_catalog_source(&app, &active[0], &query);
  }

  let mut join_set = tokio::task::JoinSet::new();
  for source in active {
    let app_bg = app.clone();
    let query_bg = query.clone();
    join_set.spawn_blocking(move || search_json_catalog_source(&app_bg, &source, &query_bg));
  }

  let mut all = Vec::new();
  while let Some(result) = join_set.join_next().await {
    if let Ok(mut chunk) = result {
      all.append(&mut chunk);
    }
  }
  all
}
