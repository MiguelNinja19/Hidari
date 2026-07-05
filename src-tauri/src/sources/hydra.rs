use crate::config;
use crate::dto::{HydraChangesResponseItem, HydraSourceDto};
use rusqlite::{params, Connection};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::time::Duration;

pub fn create_local_hydra_source(url: &str) -> HydraSourceDto {
  let normalized_url = url.trim().to_string();
  let mut hasher = DefaultHasher::new();
  normalized_url.hash(&mut hasher);
  let source_id = format!("local_{:x}", hasher.finish());
  let name = if normalized_url.to_lowercase().contains("fitgirl") {
    "FitGirl".to_string()
  } else {
    "Fonte personalizada".to_string()
  };
  let now_ms = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis())
    .unwrap_or(0);
  HydraSourceDto {
    id: source_id,
    name,
    url: normalized_url,
    status: "MATCHED".to_string(),
    download_count: 0,
    fingerprint: None,
    created_at: now_ms.to_string(),
  }
}
fn hydra_api_base_url() -> String {
  std::env::var("HYDRA_API_URL").unwrap_or_else(|_| config::HYDRA_API_URL.to_string())
}

pub fn hydra_http_client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .timeout(Duration::from_secs(20))
    .build()
    .map_err(|error| format!("could_not_create_hydra_client: {error}"))
}

pub async fn hydra_check_download_sources_changes(
  source_ids: &[String],
  games: &[(i64, String)],
) -> Result<Vec<(i64, i64)>, String> {
  let client = hydra_http_client()?;
  let since = "1970-01-01T00:00:00.000Z".to_string();
  let response = client
    .post(format!("{}/download-sources/changes", hydra_api_base_url()))
    .json(&serde_json::json!({
      "downloadSourceIds": source_ids,
      "games": games
        .iter()
        .map(|(id, _)| serde_json::json!({ "shop": "custom", "objectId": id.to_string() }))
        .collect::<Vec<_>>(),
      "since": since
    }))
    .send()
    .await
    .map_err(|error| format!("hydra_changes_request_failed: {error}"))?;

  if !response.status().is_success() {
    return Ok(Vec::new());
  }

  let parsed = response
    .json::<Vec<HydraChangesResponseItem>>()
    .await
    .map_err(|error| format!("hydra_changes_parse_failed: {error}"))?;

  let mut mapped: Vec<(i64, i64)> = Vec::new();
  for item in parsed {
    if item.shop != "custom" {
      continue;
    }
    if let Ok(game_id) = item.object_id.parse::<i64>() {
      mapped.push((game_id, item.new_download_options_count));
    }
  }

  for (game_id, _) in games {
    if !mapped.iter().any(|(id, _)| id == game_id) {
      mapped.push((*game_id, 0));
    }
  }

  Ok(mapped)
}

pub fn upsert_hydra_source(conn: &Connection, source: &HydraSourceDto) -> Result<(), String> {
  conn
    .execute(
      "INSERT INTO hydra_download_sources (id, name, url, status, download_count, fingerprint, created_at) \
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
       ON CONFLICT(id) DO UPDATE SET \
       name = excluded.name, \
       url = excluded.url, \
       status = excluded.status, \
       download_count = excluded.download_count, \
       fingerprint = excluded.fingerprint",
      params![
        source.id,
        source.name,
        source.url,
        source.status,
        source.download_count,
        source.fingerprint,
        source.created_at
      ],
    )
    .map_err(|error| format!("could_not_upsert_hydra_source: {error}"))?;
  Ok(())
}

pub fn list_hydra_sources(conn: &Connection) -> Result<Vec<HydraSourceDto>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT id, name, url, status, download_count, fingerprint, created_at \
       FROM hydra_download_sources ORDER BY created_at DESC",
    )
    .map_err(|error| format!("could_not_prepare_list_hydra_sources: {error}"))?;
  let result = stmt
    .query_map([], |row| {
      Ok(HydraSourceDto {
        id: row.get(0)?,
        name: row.get(1)?,
        url: row.get(2)?,
        status: row.get(3)?,
        download_count: row.get(4)?,
        fingerprint: row.get(5)?,
        created_at: row.get(6)?,
      })
    })
    .map_err(|error| format!("could_not_query_hydra_sources: {error}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| format!("could_not_map_hydra_sources: {error}"));
  result
}
/// Garante pelo menos uma fonte reconhecida (FitGirl) para pesquisa em Explorar funcionar sem configuração manual.
pub fn ensure_default_hydra_sources(conn: &Connection) -> Result<(), String> {
  let count: i64 = conn
    .query_row("SELECT COUNT(*) FROM hydra_download_sources", [], |row| {
      row.get(0)
    })
    .map_err(|e| format!("could_not_count_hydra_sources: {e}"))?;
  if count > 0 {
    return Ok(());
  }
  let default = create_local_hydra_source(config::FITGIRL_SITE_URL);
  upsert_hydra_source(conn, &default)
    .map_err(|e| format!("could_not_seed_default_hydra_source: {e}"))
}
