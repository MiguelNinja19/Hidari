use crate::catalog::{normalize_match_text, title_matches_query};
use crate::config;
use crate::db::open_database_connection;
use crate::dto::{DownloadOptionDto, HydraSourceDto};
use rusqlite::{params, Connection};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const MEMORY_CACHE_TTL: Duration = Duration::from_secs(5 * 60);
const SEARCH_RESULT_CACHE_TTL: Duration = Duration::from_secs(45);
const MAX_TITLES_PER_SOURCE: usize = 32;

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
struct CatalogSearchCacheKey {
  query_norm: String,
  offset: usize,
  limit: usize,
  sources_hash: u64,
}

struct CachedCatalogSearch {
  hits: Vec<CatalogTitleHit>,
  cached_at: Instant,
}

static CATALOG_SEARCH_CACHE: OnceLock<Mutex<HashMap<CatalogSearchCacheKey, CachedCatalogSearch>>> =
  OnceLock::new();

fn catalog_search_cache() -> &'static Mutex<HashMap<CatalogSearchCacheKey, CachedCatalogSearch>> {
  CATALOG_SEARCH_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn source_ids_hash(source_ids: &[String]) -> u64 {
  let mut hasher = DefaultHasher::new();
  for id in source_ids {
    id.hash(&mut hasher);
  }
  hasher.finish()
}

/// Padrões LIKE amigáveis ao índice: primeira palavra como prefixo, restantes como contém.
pub fn build_catalog_title_norm_patterns(query_norm: &str) -> Vec<String> {
  let words: Vec<&str> = query_norm
    .split_whitespace()
    .filter(|word| !word.is_empty())
    .collect();
  if words.is_empty() {
    return Vec::new();
  }
  if words.len() == 1 {
    return vec![format!("{}%", words[0])];
  }
  let mut patterns = vec![format!("{}%", words[0])];
  for word in &words[1..] {
    patterns.push(format!("%{}%", word));
  }
  patterns
}

fn catalog_group_keys_ready(conn: &Connection) -> bool {
  crate::db::read_app_setting(conn, "catalog_group_keys_v1").is_some()
}

#[derive(Debug, Clone)]
pub struct CatalogTitleHit {
  pub title: String,
  pub source_name: String,
  pub group_key: String,
  pub option_count: usize,
}

/// Pesquisa paginada agrupada por jogo — uma entrada por título limpo (não por repack).
pub fn search_distinct_catalog_titles(
  conn: &Connection,
  source_ids: &[String],
  query: &str,
  offset: usize,
  limit: usize,
) -> Vec<CatalogTitleHit> {
  if source_ids.is_empty() || query.trim().len() < 2 || limit == 0 {
    return Vec::new();
  }
  let query_norm = normalize_match_text(query);
  if query_norm.is_empty() {
    return Vec::new();
  }

  let cache_key = CatalogSearchCacheKey {
    query_norm: query_norm.clone(),
    offset,
    limit,
    sources_hash: source_ids_hash(source_ids),
  };
  if let Ok(guard) = catalog_search_cache().lock() {
    if let Some(entry) = guard.get(&cache_key) {
      if entry.cached_at.elapsed() < SEARCH_RESULT_CACHE_TTL {
        return entry.hits.clone();
      }
    }
  }

  let hits = if catalog_group_keys_ready(conn) {
    search_distinct_catalog_titles_sql(conn, source_ids, &query_norm, offset, limit)
  } else {
    search_distinct_catalog_titles_scan(conn, source_ids, query, &query_norm, offset, limit)
  };

  if let Ok(mut guard) = catalog_search_cache().lock() {
    guard.retain(|_, entry| entry.cached_at.elapsed() < SEARCH_RESULT_CACHE_TTL);
    guard.insert(
      cache_key,
      CachedCatalogSearch {
        hits: hits.clone(),
        cached_at: Instant::now(),
      },
    );
  }

  hits
}

fn search_distinct_catalog_titles_sql(
  conn: &Connection,
  source_ids: &[String],
  query_norm: &str,
  offset: usize,
  limit: usize,
) -> Vec<CatalogTitleHit> {
  let patterns = build_catalog_title_norm_patterns(query_norm);
  if patterns.is_empty() {
    return Vec::new();
  }

  let source_placeholders = source_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
  let like_clauses = patterns
    .iter()
    .map(|_| "hce.title_norm LIKE ?")
    .collect::<Vec<_>>()
    .join(" AND ");
  let fetch_limit = (offset + limit).min(64) as i64;

  let sql = format!(
    "SELECT MIN(hce.display_title) AS title, MIN(hds.name) AS source_name, \
            hce.group_key, COUNT(*) AS option_count \
     FROM hydra_catalog_entries hce \
     JOIN hydra_download_sources hds ON hds.id = hce.source_id \
     WHERE hce.source_id IN ({source_placeholders}) \
       AND hce.group_key != '' \
       AND {like_clauses} \
     GROUP BY hce.group_key \
     ORDER BY LENGTH(MIN(hce.display_title)) ASC \
     LIMIT ? OFFSET ?"
  );

  let Ok(mut stmt) = conn.prepare(&sql) else {
    return Vec::new();
  };

  let mut params: Vec<Box<dyn rusqlite::ToSql>> = source_ids
    .iter()
    .map(|id| Box::new(id.clone()) as Box<dyn rusqlite::ToSql>)
    .collect();
  for pattern in &patterns {
    params.push(Box::new(pattern.clone()));
  }
  params.push(Box::new(fetch_limit));
  params.push(Box::new(offset as i64));

  let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
  stmt
    .query_map(param_refs.as_slice(), |row| {
      let group_key: String = row.get(2)?;
      Ok(CatalogTitleHit {
        title: crate::title::catalog_game_display_title_from_group_key(&group_key),
        source_name: row.get(1)?,
        group_key,
        option_count: row.get::<_, i64>(3)? as usize,
      })
    })
    .map(|rows| rows.filter_map(Result::ok).collect())
    .unwrap_or_default()
}

fn search_distinct_catalog_titles_scan(
  conn: &Connection,
  source_ids: &[String],
  query: &str,
  query_norm: &str,
  offset: usize,
  limit: usize,
) -> Vec<CatalogTitleHit> {
  let patterns = build_catalog_title_norm_patterns(query_norm);
  if patterns.is_empty() {
    return Vec::new();
  }

  let placeholders = source_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
  let like_clauses = patterns
    .iter()
    .map(|_| "hce.title_norm LIKE ?")
    .collect::<Vec<_>>()
    .join(" AND ");
  let fetch_limit = ((offset + limit).saturating_mul(4) + 24).min(192) as i64;
  let sql = format!(
    "SELECT hce.title, hds.name FROM hydra_catalog_entries hce \
     JOIN hydra_download_sources hds ON hds.id = hce.source_id \
     WHERE hce.source_id IN ({placeholders}) AND {like_clauses} \
     ORDER BY LENGTH(hce.title) ASC \
     LIMIT ?"
  );

  let Ok(mut stmt) = conn.prepare(&sql) else {
    return Vec::new();
  };

  let mut params: Vec<Box<dyn rusqlite::ToSql>> = source_ids
    .iter()
    .map(|id| Box::new(id.clone()) as Box<dyn rusqlite::ToSql>)
    .collect();
  for pattern in &patterns {
    params.push(Box::new(pattern.clone()));
  }
  params.push(Box::new(fetch_limit));

  let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
  let Ok(rows) = stmt.query_map(param_refs.as_slice(), |row| {
    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
  }) else {
    return Vec::new();
  };

  let target_groups = offset + limit + 8;
  let mut groups: HashMap<String, CatalogTitleHit> = HashMap::new();

  for row in rows.flatten() {
    let (raw_title, source_name) = row;
    if !title_matches_query(&raw_title, query) {
      continue;
    }
    let group_key = crate::title::catalog_game_group_key(&raw_title);
    if group_key.is_empty() {
      continue;
    }

    if let Some(hit) = groups.get_mut(&group_key) {
      hit.option_count += 1;
    } else {
      groups.insert(
        group_key.clone(),
        CatalogTitleHit {
          title: crate::title::catalog_game_display_title_from_group_key(&group_key),
          source_name,
          group_key,
          option_count: 1,
        },
      );
    }

    if groups.len() >= target_groups {
      break;
    }
  }

  let mut ordered: Vec<CatalogTitleHit> = groups.into_values().collect();
  ordered.sort_by(|a, b| {
    a.title
      .len()
      .cmp(&b.title.len())
      .then_with(|| a.title.cmp(&b.title))
  });
  ordered.into_iter().skip(offset).take(limit).collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HydraLinksCatalog {
  name: Option<String>,
  downloads: Vec<HydraLinksDownload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HydraLinksDownload {
  #[serde(default)]
  title: String,
  #[serde(default, alias = "file_size")]
  file_size: Option<String>,
  #[serde(default, deserialize_with = "deserialize_uris_flexible")]
  uris: Vec<String>,
  #[serde(default, alias = "upload_date")]
  upload_date: Option<String>,
}

fn deserialize_uris_flexible<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
  D: Deserializer<'de>,
{
  use serde::de::Error;
  let value = serde_json::Value::deserialize(deserializer)?;
  match value {
    serde_json::Value::Array(items) => Ok(items
      .into_iter()
      .filter_map(|item| item.as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string))
      .collect()),
    serde_json::Value::String(text) => {
      let trimmed = text.trim();
      if trimmed.is_empty() {
        Ok(Vec::new())
      } else {
        Ok(vec![trimmed.to_string()])
      }
    }
    serde_json::Value::Null => Ok(Vec::new()),
    _ => Err(Error::custom("uris deve ser uma lista ou texto")),
  }
}

struct MemoryCacheEntry {
  catalog: HydraLinksCatalog,
  fetched_at: Instant,
}

fn memory_cache() -> &'static Mutex<HashMap<String, MemoryCacheEntry>> {
  static CACHE: OnceLock<Mutex<HashMap<String, MemoryCacheEntry>>> = OnceLock::new();
  CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_unix_ms() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis() as i64)
    .unwrap_or(0)
}

pub fn is_json_catalog_source(url: &str) -> bool {
  let lower = url.trim().to_lowercase();
  lower.ends_with(".json") || lower.contains("hydralinks.cloud/sources/")
}

pub fn is_local_catalog_path(value: &str) -> bool {
  let trimmed = value.trim();
  if trimmed.is_empty() {
    return false;
  }
  if trimmed.starts_with("file://") {
    return true;
  }
  let path = Path::new(trimmed);
  path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
    && (path.is_absolute() || trimmed.contains('\\') || trimmed.starts_with("./") || trimmed.starts_with("../"))
}

fn resolve_local_catalog_path(value: &str) -> Option<PathBuf> {
  let trimmed = value.trim();
  let path = if let Some(stripped) = trimmed.strip_prefix("file://") {
    let without_scheme = stripped.trim_start_matches('/');
    if without_scheme.len() >= 2 && without_scheme.as_bytes()[1] == b':' {
      PathBuf::from(without_scheme)
    } else {
      PathBuf::from(stripped)
    }
  } else {
    PathBuf::from(trimmed)
  };
  if path.is_file() {
    Some(path)
  } else {
    None
  }
}

fn strip_utf8_bom(body: &str) -> &str {
  body.strip_prefix('\u{FEFF}').unwrap_or(body)
}

fn normalize_catalog_body(body: &str) -> String {
  strip_utf8_bom(body).trim().to_string()
}

fn looks_like_html_catalog(body: &str) -> bool {
  let trimmed = body.trim_start();
  let head = trimmed
    .chars()
    .take(128)
    .collect::<String>()
    .to_ascii_lowercase();
  head.starts_with("<!doctype")
    || head.starts_with("<html")
    || (head.starts_with('<') && head.contains("<head"))
}

fn downloads_from_json_value(value: serde_json::Value) -> Result<Vec<HydraLinksDownload>, String> {
  let array = match value {
    serde_json::Value::Array(items) => items,
    serde_json::Value::Object(map) => {
      for key in ["downloads", "repacks", "items", "games"] {
        if let Some(serde_json::Value::Array(items)) = map.get(key) {
          return serde_json::from_value(serde_json::Value::Array(items.clone()))
            .map_err(|error| format!("Entradas em \"{key}\" inválidas: {error}"));
        }
      }
      return Err(
        "Falta a lista \"downloads\" (ou \"repacks\"). Formato: { \"name\": \"...\", \"downloads\": [ ... ] }."
          .to_string(),
      );
    }
    _ => {
      return Err(
        "O arquivo deve ser um objeto JSON com \"downloads\" ou uma lista de jogos.".to_string(),
      );
    }
  };

  serde_json::from_value(serde_json::Value::Array(array))
    .map_err(|error| format!("Entradas do catálogo inválidas: {error}"))
}

fn parse_catalog_json(body: &str) -> Result<HydraLinksCatalog, String> {
  let normalized = normalize_catalog_body(body);
  if normalized.is_empty() {
    return Err("O arquivo está vazio.".to_string());
  }
  if looks_like_html_catalog(&normalized) {
    return Err(
      "O arquivo selecionado não é JSON — parece ser texto/HTML. \
Use um catálogo .json no formato Hydra (objeto com \"name\" e \"downloads\")."
        .to_string(),
    );
  }

  let value: serde_json::Value = serde_json::from_str(&normalized).map_err(|error| {
    format!(
      "JSON inválido. O arquivo deve ter \"downloads\" com \"title\" e \"uris\". Detalhe: {error}"
    )
  })?;

  let name = value
    .get("name")
    .and_then(|v| v.as_str())
    .map(str::to_string);

  let mut downloads = match serde_json::from_value::<HydraLinksCatalog>(value.clone()) {
    Ok(catalog) => catalog.downloads,
    Err(_) => downloads_from_json_value(value)?,
  };

  downloads.retain(|entry| {
    !entry.title.trim().is_empty() && !entry.uris.is_empty()
  });

  if downloads.is_empty() {
    return Err(
      "Nenhuma entrada válida encontrada — cada item precisa de \"title\" e pelo menos um link em \"uris\"."
        .to_string(),
    );
  }

  Ok(HydraLinksCatalog { name, downloads })
}

pub fn json_slug_from_url(url: &str) -> Option<String> {
  let trimmed = url.trim().trim_end_matches('/');
  if let Some(file_name) = Path::new(trimmed).file_name().and_then(|name| name.to_str()) {
    if file_name.to_lowercase().ends_with(".json") {
      return Some(file_name.trim_end_matches(".json").to_string());
    }
  }
  let file = trimmed.rsplit('/').next()?;
  if !file.to_lowercase().ends_with(".json") {
    return None;
  }
  Some(file.trim_end_matches(".json").to_string())
}

pub fn display_name_for_source_url(url: &str) -> String {
  if let Some(slug) = json_slug_from_url(url) {
    return humanize_source_slug(&slug);
  }
  if let Some(path) = resolve_local_catalog_path(url) {
    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
      return humanize_source_slug(stem);
    }
  }
  let lower = url.to_lowercase();
  if lower.contains("fitgirl-repacks.site") || lower.contains("fitgirl") {
    return "FitGirl".to_string();
  }
  "Fonte personalizada".to_string()
}

fn humanize_source_slug(slug: &str) -> String {
  match slug.to_ascii_lowercase().as_str() {
    "fitgirl" => return "FitGirl".to_string(),
    "xatab" => return "XATAB".to_string(),
    "dodi" => return "DODI".to_string(),
    "steamrip" => return "SteamRip".to_string(),
    "gog" => return "GOG".to_string(),
    "onlinefix" => return "Online-Fix".to_string(),
    _ => {}
  }

  let normalized = slug.replace(['-', '_'], " ");
  if normalized.chars().all(|c| c.is_ascii_uppercase() || !c.is_alphabetic()) {
    return normalized;
  }
  normalized
    .split_whitespace()
    .map(|word| {
      let mut chars = word.chars();
      match chars.next() {
        None => String::new(),
        Some(first) => {
          let mut out = first.to_ascii_uppercase().to_string();
          out.push_str(&chars.as_str().to_ascii_lowercase());
          out
        }
      }
    })
    .collect::<Vec<_>>()
    .join(" ")
}

fn classify_uri(uri: &str) -> Option<(String, String)> {
  let trimmed = uri.trim();
  if trimmed.is_empty() {
    return None;
  }
  let lower = trimmed.to_ascii_lowercase();
  if lower.starts_with("magnet:?") {
    return Some(("torrent".to_string(), trimmed.to_string()));
  }
  if lower.starts_with("http://") || lower.starts_with("https://") {
    let download_type = if lower.ends_with(".torrent") {
      "torrent"
    } else {
      "http"
    };
    return Some((download_type.to_string(), trimmed.to_string()));
  }
  None
}

fn read_catalog_file(path: &Path) -> Result<(HydraLinksCatalog, String), String> {
  let raw = std::fs::read_to_string(path).map_err(|error| {
    format!(
      "Não foi possível ler \"{}\": {error}",
      path.display()
    )
  })?;
  let body = normalize_catalog_body(&raw);
  let catalog = parse_catalog_json(&body)?;
  Ok((catalog, body))
}

fn read_catalog_from_db(app: &AppHandle, source_id: &str) -> Option<HydraLinksCatalog> {
  let conn = open_database_connection(app).ok()?;
  conn
    .query_row(
      "SELECT payload_json FROM hydra_source_catalogs WHERE source_id = ?1",
      params![source_id],
      |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|payload| parse_catalog_json(&payload).ok())
}

fn payload_hash(body: &str) -> String {
  let mut hasher = DefaultHasher::new();
  body.hash(&mut hasher);
  format!("{:x}", hasher.finish())
}

fn stored_payload_hash(conn: &Connection, source_id: &str) -> Option<String> {
  conn
    .query_row(
      "SELECT payload_hash FROM hydra_source_catalogs WHERE source_id = ?1",
      params![source_id],
      |row| row.get(0),
    )
    .ok()
}

fn rebuild_catalog_index(
  conn: &Connection,
  source_id: &str,
  catalog: &HydraLinksCatalog,
) -> Result<(), String> {
  conn
    .execute(
      "DELETE FROM hydra_catalog_entries WHERE source_id = ?1",
      params![source_id],
    )
    .map_err(|error| format!("could_not_clear_catalog_index: {error}"))?;

  let mut stmt = conn
    .prepare(
      "INSERT INTO hydra_catalog_entries \
       (source_id, title, title_norm, file_size, uris_json, group_key, display_title) \
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .map_err(|error| format!("could_not_prepare_catalog_index: {error}"))?;

  for download in &catalog.downloads {
    let title_norm = normalize_match_text(&download.title);
    if title_norm.is_empty() {
      continue;
    }
    let group_key = crate::title::catalog_game_group_key(&download.title);
    let display_title = crate::title::clean_title_for_matching(&download.title);
    let uris_json = serde_json::to_string(&download.uris)
      .map_err(|error| format!("could_not_encode_uris: {error}"))?;
    stmt
      .execute(params![
        source_id,
        download.title,
        title_norm,
        download.file_size,
        uris_json,
        group_key,
        display_title,
      ])
      .map_err(|error| format!("could_not_insert_catalog_index: {error}"))?;
  }

  clear_catalog_search_cache();
  Ok(())
}

fn clear_catalog_search_cache() {
  if let Ok(mut guard) = catalog_search_cache().lock() {
    guard.clear();
  }
}

fn write_catalog_to_db(
  app: &AppHandle,
  source_id: &str,
  source_ref: &str,
  body: &str,
  catalog: &HydraLinksCatalog,
) -> Result<(), String> {
  let conn = open_database_connection(app)?;
  let hash = payload_hash(body);
  conn
    .execute(
      "INSERT INTO hydra_source_catalogs (source_id, source_url, payload_json, payload_hash, fetched_at) \
       VALUES (?1, ?2, ?3, ?4, ?5) \
       ON CONFLICT(source_id) DO UPDATE SET \
         source_url = excluded.source_url, \
         payload_json = excluded.payload_json, \
         payload_hash = excluded.payload_hash, \
         fetched_at = excluded.fetched_at",
      params![source_id, source_ref, body, hash, now_unix_ms()],
    )
    .map_err(|error| format!("could_not_save_source_catalog: {error}"))?;
  rebuild_catalog_index(&conn, source_id, catalog)?;
  Ok(())
}

pub fn delete_source_catalog(app: &AppHandle, source_id: &str) {
  if let Ok(conn) = open_database_connection(app) {
    let _ = conn.execute(
      "DELETE FROM hydra_catalog_entries WHERE source_id = ?1",
      params![source_id],
    );
    let _ = conn.execute(
      "DELETE FROM hydra_source_catalogs WHERE source_id = ?1",
      params![source_id],
    );
  }
  if let Ok(mut cache) = memory_cache().lock() {
    cache.remove(source_id);
  }
}

fn remember_in_memory(source_id: &str, catalog: HydraLinksCatalog) {
  if let Ok(mut cache) = memory_cache().lock() {
    cache.insert(
      source_id.to_string(),
      MemoryCacheEntry {
        catalog,
        fetched_at: Instant::now(),
      },
    );
  }
}

fn read_memory_cache(source_id: &str) -> Option<HydraLinksCatalog> {
  let cache = memory_cache().lock().ok()?;
  let entry = cache.get(source_id)?;
  if entry.fetched_at.elapsed() >= MEMORY_CACHE_TTL {
    return None;
  }
  Some(entry.catalog.clone())
}

fn resolve_local_catalog_path_for_write(value: &str) -> Result<PathBuf, String> {
  let trimmed = value.trim();
  let path = if let Some(stripped) = trimmed.strip_prefix("file://") {
    let without_scheme = stripped.trim_start_matches('/');
    if without_scheme.len() >= 2 && without_scheme.as_bytes()[1] == b':' {
      PathBuf::from(without_scheme)
    } else {
      PathBuf::from(stripped)
    }
  } else {
    PathBuf::from(trimmed)
  };
  if path
    .extension()
    .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
  {
    Ok(path)
  } else {
    Err("Caminho do arquivo .json inválido.".to_string())
  }
}

fn catalog_file_name_from_path(local_path: &str) -> Result<String, String> {
  let path = resolve_local_catalog_path_for_write(local_path)?;
  path
    .file_name()
    .and_then(|name| name.to_str())
    .map(str::to_string)
    .ok_or_else(|| "Não foi possível determinar o nome do arquivo .json.".to_string())
}

/// URLs remotas para actualizar o ficheiro local (mirror GitHub, sem Cloudflare).
pub fn catalog_update_urls_for_local_path(local_path: &str) -> Result<Vec<(&'static str, String)>, String> {
  let file_name = catalog_file_name_from_path(local_path)?;
  Ok(vec![(
    "mirror GitHub",
    format!(
      "{}/{}",
      config::HYDRALINKS_GITHUB_MIRROR_BASE.trim_end_matches('/'),
      file_name
    ),
  )])
}

/// URL remota no hydralinks a partir do nome do ficheiro local (ex.: fitgirl.json).
pub fn hydralinks_remote_url_for_local_path(local_path: &str) -> Option<String> {
  let path = resolve_local_catalog_path_for_write(local_path).ok()?;
  let file_name = path.file_name()?.to_str()?;
  if !file_name.to_lowercase().ends_with(".json") {
    return None;
  }
  Some(format!(
    "{}/{}",
    config::HYDRALINKS_SOURCES_BASE.trim_end_matches('/'),
    file_name
  ))
}

fn hydralinks_fetch_error(status: reqwest::StatusCode) -> String {
  if status.as_u16() == 403 {
    return "hydralinks.cloud bloqueou o pedido (Cloudflare 403)".to_string();
  }
  format!("hydralinks.cloud respondeu com HTTP {status}")
}

async fn fetch_remote_catalog_body(remote_url: &str) -> Result<String, String> {
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(90))
    .user_agent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
       (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    )
    .build()
    .map_err(|error| format!("Não foi possível preparar o cliente HTTP: {error}"))?;

  let response = client
    .get(remote_url)
    .header("Accept", "application/json, text/plain, */*")
    .send()
    .await
    .map_err(|error| format!("Falha ao baixar: {error}"))?;

  if !response.status().is_success() {
    return Err(hydralinks_fetch_error(response.status()));
  }

  response
    .text()
    .await
    .map_err(|error| format!("Não foi possível ler a resposta: {error}"))
}

async fn fetch_catalog_body_for_local_path(local_path: &str) -> Result<(String, String), String> {
  let candidates = catalog_update_urls_for_local_path(local_path)?;
  let mut errors: Vec<String> = Vec::new();

  for (label, url) in candidates {
    match fetch_remote_catalog_body(&url).await {
      Ok(body) if looks_like_html_catalog(&body) => {
        errors.push(format!("{label}: resposta HTML inválida"));
      }
      Ok(body) => match parse_catalog_json(&body) {
        Ok(_) => return Ok((body, label.to_string())),
        Err(error) => errors.push(format!("{label}: {error}")),
      },
      Err(error) => errors.push(format!("{label}: {error}")),
    }
  }

  Err(format!(
    "Não foi possível atualizar o catálogo online. {}",
    errors.join(" · ")
  ))
}

/// Resultado de sync: actualizado, já em dia, ou só offline.
pub enum SyncCatalogOutcome {
  Updated(usize),
  Unchanged(usize),
  OfflineOnly { count: usize, warning: String },
}

/// Descarrega o catálogo online, grava no ficheiro local e importa.
/// A API Hydra verifica se há novidade (sem devolver JSON); o corpo vem do mirror GitHub.
pub async fn sync_source_catalog_from_remote(
  app: &AppHandle,
  source: &HydraSourceDto,
) -> Result<(SyncCatalogOutcome, Option<super::hydra::HydraApiDownloadSource>), String> {
  let source_id = source.id.as_str();
  let local_path = source.url.as_str();
  let path = resolve_local_catalog_path_for_write(local_path)?;
  let hydralinks_url = hydralinks_remote_url_for_local_path(local_path).ok_or_else(|| {
    "Mantenha o nome original do arquivo (ex.: fitgirl.json) para atualizar via API Hydra."
      .to_string()
  })?;

  let mut api_warning: Option<String> = None;
  let api_meta = match super::hydra::hydra_refresh_download_source_meta(
    &hydralinks_url,
    source.api_source_id.as_deref(),
    source.fingerprint.as_deref(),
  )
  .await
  {
    Ok(meta) => Some(meta),
    Err(error) => {
      api_warning = Some(error);
      None
    }
  };

  if let Some(ref meta) = api_meta {
    let unchanged = source
      .fingerprint
      .as_deref()
      .filter(|value| super::hydra::is_catalog_content_fingerprint(value))
      .is_some_and(|stored| meta.fingerprint.as_deref() == Some(stored));
    if unchanged && has_local_catalog(app, source_id) {
      let count = if let Ok(conn) = open_database_connection(app) {
        conn
          .query_row(
            "SELECT COUNT(*) FROM hydra_catalog_entries WHERE source_id = ?1",
            params![source_id],
            |row| row.get::<_, i64>(0),
          )
          .unwrap_or(meta.download_count)
          .max(0) as usize
      } else {
        meta.download_count.max(0) as usize
      };
      return Ok((SyncCatalogOutcome::Unchanged(count), api_meta.clone()));
    }
  }

  match fetch_catalog_body_for_local_path(local_path).await {
    Ok((body, _label)) => apply_downloaded_catalog_body(
      app,
      source_id,
      local_path,
      &path,
      &body,
      api_meta,
    ),
    Err(mirror_error) => {
      let detail = match api_warning {
        Some(api) => format!("API Hydra: {api} · Mirror: {mirror_error}"),
        None => mirror_error,
      };
      if has_local_catalog(app, source_id) {
        download_catalog_fallback(app, source_id, Some(detail))
      } else {
        Err(detail)
      }
    }
  }
}

fn download_catalog_fallback(
  app: &AppHandle,
  source_id: &str,
  error: Option<String>,
) -> Result<(SyncCatalogOutcome, Option<super::hydra::HydraApiDownloadSource>), String> {
  if !has_local_catalog(app, source_id) {
    return Err(error.unwrap_or_else(|| "Atualização online falhou.".to_string()));
  }
  let count = if let Ok(conn) = open_database_connection(app) {
    conn
      .query_row(
        "SELECT COUNT(*) FROM hydra_catalog_entries WHERE source_id = ?1",
        params![source_id],
        |row| row.get::<_, i64>(0),
      )
      .unwrap_or(0) as usize
  } else {
    0
  };
  let detail = error.unwrap_or_else(|| "Sem conexão.".to_string());
  Ok((
    SyncCatalogOutcome::OfflineOnly {
      count,
      warning: format!(
        "Catálogo local mantido ({count} entradas). {detail}"
      ),
    },
    None,
  ))
}

fn apply_downloaded_catalog_body(
  app: &AppHandle,
  source_id: &str,
  local_path: &str,
  path: &Path,
  body: &str,
  api_meta: Option<super::hydra::HydraApiDownloadSource>,
) -> Result<(SyncCatalogOutcome, Option<super::hydra::HydraApiDownloadSource>), String> {
  let hash = payload_hash(body);

  if let Ok(conn) = open_database_connection(app) {
    if stored_payload_hash(&conn, source_id).as_deref() == Some(hash.as_str()) {
      let count = conn
        .query_row(
          "SELECT COUNT(*) FROM hydra_catalog_entries WHERE source_id = ?1",
          params![source_id],
          |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) as usize;
      return Ok((SyncCatalogOutcome::Unchanged(count), api_meta));
    }
  }

  let catalog = parse_catalog_json(body)
    .map_err(|error| format!("O catálogo baixado não é válido: {error}"))?;
  let count = catalog.downloads.len();

  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent)
      .map_err(|error| format!("Não foi possível criar a pasta do catálogo: {error}"))?;
  }

  std::fs::write(path, body)
    .map_err(|error| format!("Não foi possível gravar o arquivo local: {error}"))?;

  write_catalog_to_db(app, source_id, local_path.trim(), body, &catalog)?;
  remember_in_memory(source_id, catalog);
  Ok((SyncCatalogOutcome::Updated(count), api_meta))
}

/// Importa catálogo a partir de um ficheiro .json local (sem aceder à internet).
pub fn import_source_catalog_from_file(
  app: &AppHandle,
  source_id: &str,
  file_path: &str,
) -> Result<usize, String> {
  let path = resolve_local_catalog_path(file_path).ok_or_else(|| {
    format!(
      "Arquivo não encontrado: {file_path}. Confirme que o caminho existe e termina em .json."
    )
  })?;
  let (catalog, body) = read_catalog_file(&path)?;
  let count = catalog.downloads.len();
  write_catalog_to_db(app, source_id, file_path.trim(), &body, &catalog)?;
  remember_in_memory(source_id, catalog);
  Ok(count)
}

pub fn has_local_catalog(app: &AppHandle, source_id: &str) -> bool {
  if read_memory_cache(source_id).is_some() {
    return true;
  }
  read_catalog_from_db(app, source_id).is_some()
}

fn load_catalog_local(app: &AppHandle, source_id: &str) -> Option<HydraLinksCatalog> {
  if let Some(catalog) = read_memory_cache(source_id) {
    return Some(catalog);
  }

  let catalog = read_catalog_from_db(app, source_id)?;
  remember_in_memory(source_id, catalog.clone());
  Some(catalog)
}

fn search_json_catalog_indexed(
  source: &HydraSourceDto,
  query: &str,
  conn: &Connection,
) -> Vec<DownloadOptionDto> {
  let query_norm = normalize_match_text(query);
  if query_norm.is_empty() {
    return Vec::new();
  }

  let patterns = build_catalog_title_norm_patterns(&query_norm);
  if patterns.is_empty() {
    return Vec::new();
  }

  let like_clauses = patterns
    .iter()
    .map(|_| "title_norm LIKE ?")
    .collect::<Vec<_>>()
    .join(" AND ");
  let sql = format!(
    "SELECT title, file_size, uris_json FROM hydra_catalog_entries \
     WHERE source_id = ?1 AND {like_clauses} LIMIT 120"
  );

  let Ok(mut stmt) = conn.prepare(&sql) else {
    return Vec::new();
  };

  let mut params: Vec<Box<dyn rusqlite::ToSql>> =
    vec![Box::new(source.id.clone()) as Box<dyn rusqlite::ToSql>];
  for pattern in &patterns {
    params.push(Box::new(pattern.clone()));
  }
  let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

  let rows = match stmt.query_map(param_refs.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, Option<String>>(1)?,
      row.get::<_, String>(2)?,
    ))
  }) {
    Ok(rows) => rows,
    Err(_) => return Vec::new(),
  };

  let source_name = source.name.clone();
  let mut options = Vec::new();
  let mut seen_urls = HashSet::new();
  let mut seen_titles = HashSet::new();

  for row in rows.flatten() {
    let (title, file_size, uris_json) = row;
    if !title_matches_query(&title, query) {
      continue;
    }
    let title_key = normalize_match_text(&title);
    if title_key.is_empty() || !seen_titles.insert(title_key) {
      continue;
    }

    let uris: Vec<String> = serde_json::from_str(&uris_json).unwrap_or_default();
    for (idx, uri) in uris.iter().enumerate() {
      let Some((download_type, mut url)) = classify_uri(uri) else {
        continue;
      };
      if !seen_urls.insert(url.clone()) {
        continue;
      }
      if download_type == "torrent" && url.to_ascii_lowercase().starts_with("magnet:?") {
        url = super::enrich_magnet_url(&url);
      }
      let quality = file_size
        .as_ref()
        .map(|size| size.trim().to_string())
        .filter(|size| !size.is_empty())
        .unwrap_or_else(|| format!("Link {}", idx + 1));

      options.push(DownloadOptionDto {
        source_id: source.id.clone(),
        source_name: source_name.clone(),
        title: title.clone(),
        download_type,
        url,
        quality,
        cover_url: None,
      });
    }

    if seen_titles.len() >= MAX_TITLES_PER_SOURCE {
      return options;
    }
  }

  options
}

pub fn search_json_catalog_source(
  app: &AppHandle,
  source: &HydraSourceDto,
  query: &str,
) -> Vec<DownloadOptionDto> {
  if let Ok(conn) = open_database_connection(app) {
    let indexed_count: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM hydra_catalog_entries WHERE source_id = ?1",
        params![source.id],
        |row| row.get(0),
      )
      .unwrap_or(0);
    if indexed_count > 0 {
      return search_json_catalog_indexed(source, query, &conn);
    }

    if let Some(catalog) = load_catalog_local(app, &source.id) {
      if rebuild_catalog_index(&conn, &source.id, &catalog).is_ok() {
        return search_json_catalog_indexed(source, query, &conn);
      }
    }
  }

  let Some(catalog) = load_catalog_local(app, &source.id) else {
    return Vec::new();
  };

  let source_name = catalog
    .name
    .as_ref()
    .map(|name| name.trim().to_string())
    .filter(|name| !name.is_empty())
    .unwrap_or_else(|| source.name.clone());

  let mut options = Vec::new();
  let mut seen_urls = HashSet::new();
  let mut seen_titles = HashSet::new();

  for download in &catalog.downloads {
    if !title_matches_query(&download.title, query) {
      continue;
    }

    let title_key = normalize_match_text(&download.title);
    if title_key.is_empty() || !seen_titles.insert(title_key) {
      continue;
    }

    for (idx, uri) in download.uris.iter().enumerate() {
      let Some((download_type, mut url)) = classify_uri(uri) else {
        continue;
      };

      if !seen_urls.insert(url.clone()) {
        continue;
      }

      if download_type == "torrent" && url.to_ascii_lowercase().starts_with("magnet:?") {
        url = super::enrich_magnet_url(&url);
      }

      let quality = download
        .file_size
        .as_ref()
        .map(|size| size.trim().to_string())
        .filter(|size| !size.is_empty())
        .unwrap_or_else(|| format!("Link {}", idx + 1));

      options.push(DownloadOptionDto {
        source_id: source.id.clone(),
        source_name: source_name.clone(),
        title: download.title.clone(),
        download_type,
        url,
        quality,
        cover_url: None,
      });
    }

    if seen_titles.len() >= MAX_TITLES_PER_SOURCE {
      return options;
    }
  }

  options
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn build_catalog_title_norm_patterns_uses_prefix_for_single_word() {
    let patterns = build_catalog_title_norm_patterns("elden ring");
    assert_eq!(patterns, vec!["elden%", "%ring%"]);
    assert_eq!(
      build_catalog_title_norm_patterns("hades"),
      vec!["hades%".to_string()]
    );
  }

  #[test]
  fn detects_json_catalog_urls() {
    assert!(is_json_catalog_source(
      "https://hydralinks.cloud/sources/xatab.json"
    ));
    assert!(is_json_catalog_source("https://example.com/custom.json"));
    assert!(!is_json_catalog_source("https://fitgirl-repacks.site"));
  }

  #[test]
  fn detects_local_json_paths() {
    assert!(is_local_catalog_path(r"C:\catalogs\xatab.json"));
    assert!(is_local_catalog_path("file:///C:/catalogs/fitgirl.json"));
    assert!(!is_local_catalog_path("https://hydralinks.cloud/sources/xatab.json"));
  }

  #[test]
  fn humanizes_source_slugs() {
    assert_eq!(
      display_name_for_source_url("https://hydralinks.cloud/sources/xatab.json"),
      "XATAB"
    );
    assert_eq!(
      display_name_for_source_url("https://hydralinks.cloud/sources/fitgirl.json"),
      "FitGirl"
    );
  }

  #[test]
  fn classifies_magnet_and_http_uris() {
    let magnet = classify_uri("magnet:?xt=urn:btih:abc123").expect("magnet");
    assert_eq!(magnet.0, "torrent");

    let http = classify_uri("https://cdn.example.com/game.zip").expect("http");
    assert_eq!(http.0, "http");
  }

  #[test]
  fn parses_hydralinks_catalog_json() {
    let body = r#"{
      "name": "XATAB",
      "downloads": [
        {
          "title": "Hades",
          "fileSize": "10 GB",
          "uris": ["magnet:?xt=urn:btih:abc123"]
        }
      ]
    }"#;
    let catalog = parse_catalog_json(body).expect("catalog");
    assert_eq!(catalog.downloads.len(), 1);
    assert_eq!(catalog.downloads[0].title, "Hades");
  }

  #[test]
  fn rejects_html_saved_as_json() {
    let body = "<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>";
    let error = parse_catalog_json(body).expect_err("html");
    assert!(error.contains("HTML"));
  }

  #[test]
  fn parses_catalog_with_utf8_bom() {
    let body = "\u{FEFF}{\"name\":\"XATAB\",\"downloads\":[{\"title\":\"Hades\",\"uris\":[\"magnet:?xt=urn:btih:abc\"]}]}";
    let catalog = parse_catalog_json(body).expect("bom");
    assert_eq!(catalog.downloads.len(), 1);
  }

  #[test]
  fn accepts_uris_as_single_string() {
    let body = r#"{
      "name": "Test",
      "downloads": [
        {
          "title": "Game",
          "uris": "magnet:?xt=urn:btih:abc123"
        }
      ]
    }"#;
    let catalog = parse_catalog_json(body).expect("string uri");
    assert_eq!(catalog.downloads[0].uris.len(), 1);
  }

  #[test]
  fn accepts_snake_case_catalog_fields() {
    let body = r#"{
      "name": "Test",
      "downloads": [
        {
          "title": "Game",
          "file_size": "5 GB",
          "uris": ["https://example.com/file.zip"]
        }
      ]
    }"#;
    let catalog = parse_catalog_json(body).expect("snake");
    assert_eq!(catalog.downloads[0].file_size.as_deref(), Some("5 GB"));
  }

  #[test]
  fn builds_catalog_update_urls_from_local_file() {
    let urls = catalog_update_urls_for_local_path(r"C:\catalogs\fitgirl.json").expect("urls");
    assert_eq!(urls.len(), 1);
    assert!(urls[0].1.contains("raw.githubusercontent.com"));
    assert!(urls[0].1.ends_with("/fitgirl.json"));
  }

  #[test]
  fn builds_hydralinks_remote_url_from_local_file() {
    assert_eq!(
      hydralinks_remote_url_for_local_path(r"C:\catalogs\fitgirl.json"),
      Some("https://hydralinks.cloud/sources/fitgirl.json".to_string())
    );
    assert_eq!(
      hydralinks_remote_url_for_local_path("/home/user/xatab.json"),
      Some("https://hydralinks.cloud/sources/xatab.json".to_string())
    );
  }

  #[test]
  fn payload_hash_is_stable_for_same_body() {
    let body = r#"{"name":"XATAB","downloads":[]}"#;
    assert_eq!(payload_hash(body), payload_hash(body));
    assert_ne!(payload_hash(body), payload_hash(r#"{"name":"OTHER","downloads":[]}"#));
  }
}
