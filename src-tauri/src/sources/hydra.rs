use crate::config;
use crate::catalog::title_matches_query;
use crate::dto::{CatalogGameDto, DownloadOptionDto, HydraSourceDto};
use super::hydralinks::display_name_for_source_url;
use rusqlite::{params, Connection};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn create_hydra_source(local_path: &str, remote_url: Option<&str>) -> HydraSourceDto {
  let normalized_path = local_path.trim().to_string();
  let mut hasher = DefaultHasher::new();
  normalized_path.hash(&mut hasher);
  let source_id = format!("local_{:x}", hasher.finish());
  let remote = remote_url.map(str::trim).filter(|value| !value.is_empty()).map(str::to_string);
  let name = display_name_for_source_url(
    remote.as_deref().unwrap_or(normalized_path.as_str()),
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
    remote_url: remote,
    created_at: now_ms.to_string(),
  }
}

pub fn create_hydra_source_from_remote(remote_url: &str, cache_path: &str) -> HydraSourceDto {
  let normalized_remote = remote_url.trim().to_string();
  let normalized_cache = cache_path.trim().to_string();
  let mut hasher = DefaultHasher::new();
  normalized_remote.hash(&mut hasher);
  let source_id = format!("remote_{:x}", hasher.finish());
  let name = display_name_for_source_url(&normalized_remote);
  let now_ms = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis())
    .unwrap_or(0);
  HydraSourceDto {
    id: source_id,
    name,
    url: normalized_cache,
    status: "MATCHED".to_string(),
    download_count: 0,
    fingerprint: None,
    api_source_id: None,
    remote_url: Some(normalized_remote),
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
      "API Hydra temporariamente indisponível (HTTP {status} ao {action}). Tente novamente mais tarde."
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
      "INSERT INTO hydra_download_sources (id, name, url, status, download_count, fingerprint, api_source_id, remote_url, created_at) \
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
       ON CONFLICT(id) DO UPDATE SET \
       name = excluded.name, \
       url = excluded.url, \
       status = excluded.status, \
       download_count = excluded.download_count, \
       fingerprint = excluded.fingerprint, \
       api_source_id = excluded.api_source_id, \
       remote_url = excluded.remote_url",
      params![
        source.id,
        source.name,
        source.url,
        source.status,
        source.download_count,
        source.fingerprint,
        source.api_source_id,
        source.remote_url,
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
    remote_url: row.get(7)?,
    created_at: row.get(8)?,
  })
}

pub fn list_hydra_sources(conn: &Connection) -> Result<Vec<HydraSourceDto>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT id, name, url, status, download_count, fingerprint, api_source_id, remote_url, created_at \
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
      "SELECT id, name, url, status, download_count, fingerprint, api_source_id, remote_url, created_at \
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HydraCatalogueSearchResponse {
  count: i64,
  edges: Vec<HydraCatalogueGame>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HydraCatalogueGame {
  object_id: String,
  title: String,
  shop: String,
  library_image_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydraGameRepack {
  pub id: String,
  pub title: String,
  pub file_size: Option<String>,
  pub uris: Vec<String>,
  pub download_source_id: String,
  pub download_source_name: String,
}

pub async fn hydra_catalogue_search(
  title: &str,
  fingerprints: &[String],
  take: usize,
  skip: usize,
) -> Result<HydraCatalogueSearchResponse, String> {
  let client = hydra_http_client()?;
  let take = take.max(5);
  let response = client
    .post(format!("{}/catalogue/search", hydra_api_base_url()))
    .json(&serde_json::json!({
      "title": title.trim(),
      "take": take,
      "skip": skip,
      "sortBy": "popularity",
      "sortOrder": "desc",
      "downloadSourceFingerprints": fingerprints,
      "tags": [],
      "publishers": [],
      "genres": [],
      "developers": [],
      "protondbSupportBadges": [],
      "deckCompatibility": [],
    }))
    .send()
    .await
    .map_err(|error| format!("Falha na pesquisa do catálogo Hydra: {error}"))?;

  if !response.status().is_success() {
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    let snippet = body.chars().take(120).collect::<String>();
    return Err(hydra_api_http_error(status, snippet, "pesquisar catálogo"));
  }

  response
    .json::<HydraCatalogueSearchResponse>()
    .await
    .map_err(|error| format!("Resposta inválida da pesquisa Hydra: {error}"))
}

pub async fn hydra_game_download_sources(
  shop: &str,
  object_id: &str,
  api_source_ids: &[String],
) -> Result<Vec<HydraGameRepack>, String> {
  if api_source_ids.is_empty() {
    return Ok(Vec::new());
  }

  let client = hydra_http_client()?;
  let mut request = client.get(format!(
    "{}/games/{}/{}/download-sources",
    hydra_api_base_url(),
    shop.trim(),
    object_id.trim()
  ));
  request = request.query(&[("take", "100"), ("skip", "0")]);
  for api_id in api_source_ids {
    request = request.query(&[("downloadSourceIds[]", api_id.as_str())]);
  }

  let response = request
    .send()
    .await
    .map_err(|error| format!("Falha ao obter opções de download: {error}"))?;

  if !response.status().is_success() {
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    let snippet = body.chars().take(120).collect::<String>();
    return Err(hydra_api_http_error(status, snippet, "obter downloads"));
  }

  response
    .json::<Vec<HydraGameRepack>>()
    .await
    .map_err(|error| format!("Resposta inválida de downloads Hydra: {error}"))
}

fn repack_to_download_option(
  repack: &HydraGameRepack,
  source_by_api_id: &HashMap<String, HydraSourceDto>,
) -> Vec<DownloadOptionDto> {
  let source = source_by_api_id.get(&repack.download_source_id);
  let source_id = source
    .map(|value| value.id.clone())
    .unwrap_or_else(|| repack.download_source_id.clone());
  let source_name = source
    .map(|value| value.name.clone())
    .unwrap_or_else(|| repack.download_source_name.clone());
  let quality = repack
    .file_size
    .as_ref()
    .map(|size| size.trim().to_string())
    .filter(|size| !size.is_empty())
    .unwrap_or_else(|| "—".to_string());

  let mut options = Vec::new();
  for (idx, uri) in repack.uris.iter().enumerate() {
    let trimmed = uri.trim();
    if trimmed.is_empty() {
      continue;
    }
    let lower = trimmed.to_ascii_lowercase();
    let download_type = if lower.starts_with("magnet:?") {
      "torrent"
    } else if lower.starts_with("http://") || lower.starts_with("https://") {
      if lower.ends_with(".torrent") {
        "torrent"
      } else {
        "http"
      }
    } else {
      continue;
    };
    let mut url = trimmed.to_string();
    if download_type == "torrent" && lower.starts_with("magnet:?") {
      url = super::enrich_magnet_url(&url);
    }
    options.push(DownloadOptionDto {
      source_id: source_id.clone(),
      source_name: source_name.clone(),
      title: repack.title.clone(),
      download_type: download_type.to_string(),
      url,
      quality: if quality == "—" {
        format!("Link {}", idx + 1)
      } else {
        quality.clone()
      },
      cover_url: None,
    });
  }
  options
}

pub async fn search_download_options_via_api(
  app: &tauri::AppHandle,
  sources: &[HydraSourceDto],
  query: &str,
) -> Vec<DownloadOptionDto> {
  let query = query.trim();
  if query.len() < 2 {
    return Vec::new();
  }

  let api_sources: Vec<&HydraSourceDto> = sources
    .iter()
    .filter(|source| {
      source
        .api_source_id
        .as_ref()
        .is_some_and(|value| !value.is_empty())
    })
    .collect();
  if api_sources.is_empty() {
    return Vec::new();
  }

  let api_ids: Vec<String> = api_sources
    .iter()
    .filter_map(|source| source.api_source_id.clone())
    .collect();
  let source_by_api_id: HashMap<String, HydraSourceDto> = api_sources
    .iter()
    .filter_map(|source| {
      source
        .api_source_id
        .as_ref()
        .map(|api_id| (api_id.clone(), (*source).clone()))
    })
    .collect();
  let fingerprints: Vec<String> = api_sources
    .iter()
    .filter_map(|source| {
      source
        .fingerprint
        .as_ref()
        .filter(|value| is_catalog_content_fingerprint(value))
        .cloned()
    })
    .collect();

  let catalogue = match hydra_catalogue_search(query, &fingerprints, 24, 0).await {
    Ok(value) => value,
    Err(error) => {
      eprintln!("hydra_catalogue_search_failed: {error}");
      return Vec::new();
    }
  };

  let mut options = Vec::new();
  let mut seen_urls = HashSet::new();
  let mut by_source: HashMap<String, Vec<DownloadOptionDto>> = HashMap::new();

  for game in catalogue.edges {
    let repacks = match hydra_game_download_sources(&game.shop, &game.object_id, &api_ids).await {
      Ok(value) => value,
      Err(error) => {
        eprintln!(
          "hydra_game_download_sources_failed: {} ({}/{}) — {error}",
          game.title, game.shop, game.object_id
        );
        continue;
      }
    };

    for repack in repacks {
      if !title_matches_query(&repack.title, query)
        && !title_matches_query(&game.title, query)
      {
        continue;
      }
      for option in repack_to_download_option(&repack, &source_by_api_id) {
        if seen_urls.insert(option.url.clone()) {
          by_source
            .entry(option.source_id.clone())
            .or_default()
            .push(option.clone());
          options.push(option);
        }
      }
    }
  }

  for (source_id, source_options) in by_source {
    if let Some(source) = sources.iter().find(|item| item.id == source_id) {
      let source_ref = source
        .remote_url
        .as_deref()
        .unwrap_or(source.url.as_str());
      if let Ok(inserted) = super::hydralinks::append_catalog_download_options(
        app,
        &source_id,
        source_ref,
        &source_options,
      ) {
        if inserted > 0 {
          eprintln!("catalog_api_cache_appended: {source_id} +{inserted}");
        }
      }
    }
  }

  options
}

pub async fn search_catalog_games_via_api(
  sources: &[HydraSourceDto],
  query: &str,
  offset: usize,
  limit: usize,
) -> Vec<CatalogGameDto> {
  let query = query.trim();
  if query.len() < 2 || limit == 0 {
    return Vec::new();
  }

  let api_sources: Vec<&HydraSourceDto> = sources
    .iter()
    .filter(|source| {
      source
        .api_source_id
        .as_ref()
        .is_some_and(|value| !value.is_empty())
    })
    .collect();
  if api_sources.is_empty() {
    return Vec::new();
  }

  let fingerprints: Vec<String> = api_sources
    .iter()
    .filter_map(|source| {
      source
        .fingerprint
        .as_ref()
        .filter(|value| is_catalog_content_fingerprint(value))
        .cloned()
    })
    .collect();

  let take = limit.max(5);
  let catalogue = match hydra_catalogue_search(query, &fingerprints, take, offset).await {
    Ok(value) => value,
    Err(error) => {
      eprintln!("hydra_catalogue_search_failed: {error}");
      return Vec::new();
    }
  };

  catalogue
    .edges
    .into_iter()
    .map(|game| {
      let id = format!("hydra:{}:{}", game.shop, game.object_id);
      CatalogGameDto {
        id,
        title: game.title,
        genre: String::new(),
        cover_url: game.library_image_url,
        local_cover_path: None,
        source: "hydra_api".to_string(),
        option_count: None,
      }
    })
    .collect()
}
