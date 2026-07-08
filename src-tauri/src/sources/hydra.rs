use crate::config;
use crate::dto::HydraSourceDto;
use super::hydralinks::display_name_for_source_url;
use rusqlite::{params, Connection};
use serde::Deserialize;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn create_hydra_source(local_path: &str, remote_url: Option<&str>) -> HydraSourceDto {
  let normalized_path = local_path.trim().to_string();
  let mut hasher = DefaultHasher::new();
  normalized_path.hash(&mut hasher);
  let source_id = format!("local_{:x}", hasher.finish());
  let name = display_name_for_source_url(
    remote_url.unwrap_or(normalized_path.as_str()),
  );
  let now_ms = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis())
    .unwrap_or(0);
  HydraSourceDto {
    id: source_id,
    name,
    url: normalized_path,
    status: "MATCHED".to_string(),
    download_count: 0,
    fingerprint: None,
    api_source_id: None,
    created_at: now_ms.to_string(),
  }
}

fn hydra_api_base_url() -> String {
  std::env::var("HYDRA_API_URL").unwrap_or_else(|_| config::HYDRA_API_URL.to_string())
}

pub fn hydra_http_client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(90))
    .cookie_store(true)
    .user_agent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
       (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    )
    .build()
    .map_err(|error| format!("could_not_create_hydra_client: {error}"))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydraApiDownloadSource {
  pub id: String,
  pub name: String,
  #[allow(dead_code)]
  pub url: String,
  pub status: String,
  pub download_count: i64,
  pub fingerprint: Option<String>,
}

pub fn is_catalog_content_fingerprint(value: &str) -> bool {
  let trimmed = value.trim();
  !trimmed.starts_with("http://")
    && !trimmed.starts_with("https://")
    && trimmed.len() >= 16
}

fn hydra_api_http_error(status: u16, snippet: String, action: &str) -> String {
  if status >= 500 {
    format!(
      "API Hydra temporariamente indisponível (HTTP {status} ao {action}). A atualização ainda tenta o espelho GitHub."
    )
  } else {
    format!(
      "API Hydra respondeu HTTP {status} ao {action}{}",
      if snippet.is_empty() {
        String::new()
      } else {
        format!(": {snippet}")
      }
    )
  }
}

/// Regista a URL no servidor Hydra (ele descarrega o JSON, sem Cloudflare no cliente).
pub async fn hydra_register_download_source(
  catalog_url: &str,
) -> Result<HydraApiDownloadSource, String> {
  let client = hydra_http_client()?;
  let response = client
    .post(format!("{}/download-sources", hydra_api_base_url()))
    .json(&serde_json::json!({ "url": catalog_url.trim() }))
    .send()
    .await
    .map_err(|error| format!("Falha ao registrar fonte na API Hydra: {error}"))?;

  if !response.status().is_success() {
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    let snippet = body.chars().take(120).collect::<String>();
    return Err(hydra_api_http_error(status, snippet, "registrar fonte"));
  }

  response
    .json::<HydraApiDownloadSource>()
    .await
    .map_err(|error| format!("Resposta inválida da API Hydra: {error}"))
}

pub async fn hydra_sync_download_source(
  api_source_id: &str,
) -> Result<HydraApiDownloadSource, String> {
  let client = hydra_http_client()?;
  let response = client
    .post(format!("{}/download-sources/sync", hydra_api_base_url()))
    .json(&serde_json::json!({ "ids": [api_source_id] }))
    .send()
    .await
    .map_err(|error| format!("Falha ao sincronizar fonte na API Hydra: {error}"))?;

  if !response.status().is_success() {
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    let snippet = body.chars().take(120).collect::<String>();
    return Err(hydra_api_http_error(status, snippet, "sincronizar"));
  }

  let sources = response
    .json::<Vec<HydraApiDownloadSource>>()
    .await
    .map_err(|error| format!("Resposta inválida da API Hydra: {error}"))?;

  sources
    .into_iter()
    .next()
    .ok_or_else(|| "API Hydra não retornou a fonte sincronizada.".to_string())
}

/// Regista (se necessário) e sincroniza metadados via API Hydra — 1–2 pedidos, sem JSON completo.
pub async fn hydra_refresh_download_source_meta(
  catalog_url: &str,
  existing_api_id: Option<&str>,
  _stored_fingerprint: Option<&str>,
) -> Result<HydraApiDownloadSource, String> {
  if let Some(api_id) = existing_api_id.filter(|id| !id.is_empty()) {
    hydra_sync_download_source(api_id).await
  } else {
    hydra_register_download_source(catalog_url).await
  }
}

pub fn upsert_hydra_source(conn: &Connection, source: &HydraSourceDto) -> Result<(), String> {
  conn
    .execute(
      "INSERT INTO hydra_download_sources (id, name, url, status, download_count, fingerprint, api_source_id, created_at) \
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) \
       ON CONFLICT(id) DO UPDATE SET \
       name = excluded.name, \
       url = excluded.url, \
       status = excluded.status, \
       download_count = excluded.download_count, \
       fingerprint = excluded.fingerprint, \
       api_source_id = excluded.api_source_id",
      params![
        source.id,
        source.name,
        source.url,
        source.status,
        source.download_count,
        source.fingerprint,
        source.api_source_id,
        source.created_at
      ],
    )
    .map_err(|error| format!("could_not_upsert_hydra_source: {error}"))?;
  Ok(())
}

pub fn persist_hydra_api_meta(
  conn: &Connection,
  local_source_id: &str,
  api: &HydraApiDownloadSource,
) -> Result<(), String> {
  conn
    .execute(
      "UPDATE hydra_download_sources SET \
         api_source_id = ?1, fingerprint = ?2, download_count = ?3, status = ?4, name = ?5 \
       WHERE id = ?6",
      params![
        api.id,
        api.fingerprint,
        api.download_count,
        api.status,
        api.name,
        local_source_id
      ],
    )
    .map_err(|error| format!("could_not_persist_hydra_api_meta: {error}"))?;
  Ok(())
}

fn map_hydra_source_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<HydraSourceDto> {
  Ok(HydraSourceDto {
    id: row.get(0)?,
    name: row.get(1)?,
    url: row.get(2)?,
    status: row.get(3)?,
    download_count: row.get(4)?,
    fingerprint: row.get(5)?,
    api_source_id: row.get(6)?,
    created_at: row.get(7)?,
  })
}

pub fn list_hydra_sources(conn: &Connection) -> Result<Vec<HydraSourceDto>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT id, name, url, status, download_count, fingerprint, api_source_id, created_at \
       FROM hydra_download_sources ORDER BY created_at DESC",
    )
    .map_err(|error| format!("could_not_prepare_list_hydra_sources: {error}"))?;
  let result = stmt
    .query_map([], map_hydra_source_row)
    .map_err(|error| format!("could_not_query_hydra_sources: {error}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| format!("could_not_map_hydra_sources: {error}"));
  result
}

pub fn get_hydra_source_by_id(conn: &Connection, id: &str) -> Result<HydraSourceDto, String> {
  conn
    .query_row(
      "SELECT id, name, url, status, download_count, fingerprint, api_source_id, created_at \
       FROM hydra_download_sources WHERE id = ?1",
      params![id],
      map_hydra_source_row,
    )
    .map_err(|error| format!("could_not_find_hydra_source: {error}"))
}

/// Sem fontes configuradas — o utilizador importa ficheiros .json locais.
pub fn ensure_default_hydra_sources(_conn: &Connection) -> Result<(), String> {
  Ok(())
}
