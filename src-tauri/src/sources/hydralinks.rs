use crate::catalog::{normalize_match_text, title_word_matches_query_word};
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
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const MAX_TITLES_PER_SOURCE: usize = 32;

#[derive(Debug, Clone)]
struct FileFingerprint {
  path: PathBuf,
  modified_ms: u128,
  len: u64,
}

#[derive(Debug, Clone)]
pub struct IndexedDownload {
  pub title: String,
  pub title_norm: String,
  pub group_key: String,
  pub file_size: Option<String>,
  pub uris: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct CachedCatalog {
  pub name: Option<String>,
  pub downloads: Vec<IndexedDownload>,
  /// Índices por prefixo de 2 chars de cada palavra do título (pesquisa rápida).
  prefix_index: HashMap<String, Vec<usize>>,
  fingerprint: Option<FileFingerprint>,
}

struct MemoryCacheEntry {
  catalog: std::sync::Arc<CachedCatalog>,
}

fn memory_cache() -> &'static Mutex<HashMap<String, MemoryCacheEntry>> {
  static CACHE: OnceLock<Mutex<HashMap<String, MemoryCacheEntry>>> = OnceLock::new();
  CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn file_fingerprint(path: &Path) -> Option<FileFingerprint> {
  let meta = std::fs::metadata(path).ok()?;
  let modified_ms = meta
    .modified()
    .ok()?
    .duration_since(UNIX_EPOCH)
    .ok()?
    .as_millis();
  Some(FileFingerprint {
    path: path.to_path_buf(),
    modified_ms,
    len: meta.len(),
  })
}

fn index_catalog(catalog: HydraLinksCatalog, fingerprint: Option<FileFingerprint>) -> CachedCatalog {
  let downloads: Vec<IndexedDownload> = catalog
    .downloads
    .into_iter()
    .filter_map(|download| {
      let title = download.title.trim().to_string();
      if title.is_empty() {
        return None;
      }
      let title_norm = normalize_match_text(&title);
      if title_norm.is_empty() {
        return None;
      }
      let group_key = crate::title::catalog_game_group_key(&title);
      Some(IndexedDownload {
        title,
        title_norm,
        group_key,
        file_size: download.file_size,
        uris: download.uris,
      })
    })
    .collect();

  let mut prefix_index: HashMap<String, Vec<usize>> = HashMap::new();
  for (idx, download) in downloads.iter().enumerate() {
    for word in download.title_norm.split_whitespace() {
      let key: String = word.chars().take(2).collect();
      if key.chars().count() < 2 {
        continue;
      }
      prefix_index.entry(key).or_default().push(idx);
    }
  }

  CachedCatalog {
    name: catalog.name,
    downloads,
    prefix_index,
    fingerprint,
  }
}

fn candidate_indices_for_query<'a>(
  catalog: &'a CachedCatalog,
  query_norm: &str,
) -> Option<&'a [usize]> {
  let first_word = query_norm.split_whitespace().next()?;
  let key: String = first_word.chars().take(2).collect();
  if key.chars().count() < 2 {
    return None;
  }
  catalog.prefix_index.get(&key).map(Vec::as_slice)
}

fn catalog_from_cached(cached: &CachedCatalog) -> HydraLinksCatalog {
  HydraLinksCatalog {
    name: cached.name.clone(),
    downloads: cached
      .downloads
      .iter()
      .map(|download| HydraLinksDownload {
        title: download.title.clone(),
        file_size: download.file_size.clone(),
        uris: download.uris.clone(),
        upload_date: None,
      })
      .collect(),
  }
}

fn title_norm_matches_query_norm(title_norm: &str, query_norm: &str) -> bool {
  let title_words: Vec<&str> = title_norm.split_whitespace().collect();
  let query_words: Vec<&str> = query_norm
    .split_whitespace()
    .filter(|word| !word.is_empty())
    .collect();
  if query_words.is_empty() {
    return true;
  }
  query_words.iter().all(|query_word| {
    if query_word.len() <= 2 {
      return title_words.iter().any(|title_word| title_word == query_word);
    }
    title_words
      .iter()
      .any(|title_word| title_word_matches_query_word(title_word, query_word))
  })
}

fn remember_cached(source_id: &str, catalog: CachedCatalog) {
  if let Ok(mut cache) = memory_cache().lock() {
    cache.insert(
      source_id.to_string(),
      MemoryCacheEntry {
        catalog: std::sync::Arc::new(catalog),
      },
    );
  }
}

fn remember_in_memory(source_id: &str, catalog: HydraLinksCatalog) {
  remember_cached(source_id, index_catalog(catalog, None));
}

fn read_memory_cache_arc(source_id: &str) -> Option<std::sync::Arc<CachedCatalog>> {
  let cache = memory_cache().lock().ok()?;
  cache.get(source_id).map(|entry| entry.catalog.clone())
}

fn read_memory_cache(source_id: &str) -> Option<HydraLinksCatalog> {
  let cached = read_memory_cache_arc(source_id)?;
  Some(catalog_from_cached(&cached))
}

fn read_memory_cache_if_fresh(
  source_id: &str,
  fingerprint: Option<&FileFingerprint>,
) -> Option<std::sync::Arc<CachedCatalog>> {
  let cached = read_memory_cache_arc(source_id)?;
  match (fingerprint, cached.fingerprint.as_ref()) {
    (Some(expected), Some(actual))
      if expected.path == actual.path
        && expected.modified_ms == actual.modified_ms
        && expected.len == actual.len =>
    {
      Some(cached)
    }
    (None, None) => Some(cached),
    // Sem ficheiro no disco: cache em memória ainda serve (payload DB / API).
    (None, Some(_)) => Some(cached),
    _ => None,
  }
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

#[derive(Debug, Clone)]
pub struct CatalogTitleHit {
  pub title: String,
  pub _source_name: String,
  pub group_key: String,
  pub option_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydraLinksCatalog {
  pub name: Option<String>,
  pub downloads: Vec<HydraLinksDownload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydraLinksDownload {
  #[serde(default)]
  pub title: String,
  #[serde(default, alias = "file_size")]
  pub file_size: Option<String>,
  #[serde(default, deserialize_with = "deserialize_uris_flexible")]
  pub uris: Vec<String>,
  #[serde(default, alias = "upload_date")]
  pub upload_date: Option<String>,
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

pub fn is_remote_catalog_url(value: &str) -> bool {
  let trimmed = value.trim();
  (trimmed.starts_with("http://") || trimmed.starts_with("https://"))
    && is_json_catalog_source(trimmed)
}

/// Normaliza URLs oficiais do hydralinks (ex.: sem `/sources/`).
pub fn normalize_remote_catalog_url(url: &str) -> Result<String, String> {
  let trimmed = url.trim();
  if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
    return Err(
      "A URL deve começar com http:// ou https:// e apontar para um catálogo .json.".to_string(),
    );
  }
  if !is_json_catalog_source(trimmed) {
    return Err(
      "Use uma URL de catálogo .json (ex.: https://hydralinks.cloud/sources/fitgirl.json)."
        .to_string(),
    );
  }

  let lower = trimmed.to_lowercase();
  if lower.contains("hydralinks.cloud/") && !lower.contains("/sources/") {
    if let Some(file_name) = Path::new(trimmed)
      .file_name()
      .and_then(|name| name.to_str())
      .filter(|name| name.to_lowercase().ends_with(".json"))
    {
      return Ok(format!(
        "{}/{}",
        config::HYDRALINKS_SOURCES_BASE.trim_end_matches('/'),
        file_name
      ));
    }
  }

  Ok(trimmed.to_string())
}

pub fn catalog_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
  app
    .path()
    .app_data_dir()
    .map_err(|error| format!("Não foi possível resolver a pasta de dados da aplicação: {error}"))
    .map(|dir| dir.join("catalogs"))
}

pub fn catalog_cache_path_for_remote_url(
  app: &AppHandle,
  remote_url: &str,
) -> Result<PathBuf, String> {
  let normalized = normalize_remote_catalog_url(remote_url)?;
  let file_name = catalog_file_name_from_path(&normalized)?;
  Ok(catalog_cache_dir(app)?.join(file_name))
}

fn catalog_import_cache_path_in_dir(
  cache_dir: &Path,
  external_path: &Path,
  body: &str,
) -> Result<PathBuf, String> {
  let file_name = external_path
    .file_name()
    .and_then(|name| name.to_str())
    .ok_or_else(|| "Não foi possível determinar o nome do arquivo .json.".to_string())?;
  let target = cache_dir.join(file_name);
  let normalized_body = normalize_catalog_body(body);

  if target.is_file() {
    let existing = std::fs::read_to_string(&target).unwrap_or_default();
    if normalize_catalog_body(&existing) == normalized_body {
      return Ok(target);
    }
    let stem = Path::new(file_name)
      .file_stem()
      .and_then(|name| name.to_str())
      .unwrap_or("catalog");
    let suffix = &payload_hash(&normalized_body)[..8];
    return Ok(cache_dir.join(format!("{stem}-{suffix}.json")));
  }

  Ok(target)
}

/// Destino em `AppData/.../catalogs/` para uma importação local (evita colisões).
pub fn catalog_import_cache_path(
  app: &AppHandle,
  external_path: &Path,
  body: &str,
) -> Result<PathBuf, String> {
  let cache_dir = catalog_cache_dir(app)?;
  catalog_import_cache_path_in_dir(&cache_dir, external_path, body)
}

pub fn resolve_remote_catalog_url(source: &HydraSourceDto) -> Option<String> {
  source
    .remote_url
    .as_ref()
    .map(|value| value.trim())
    .filter(|value| !value.is_empty())
    .map(str::to_string)
    .or_else(|| hydralinks_remote_url_for_local_path(&source.url))
}

pub fn is_syncable_catalog_source(source: &HydraSourceDto) -> bool {
  is_local_catalog_path(&source.url)
    || resolve_remote_catalog_url(source).is_some()
    || source
      .api_source_id
      .as_ref()
      .is_some_and(|value| !value.is_empty())
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
  let file = Path::new(trimmed)
    .file_name()
    .and_then(|name| name.to_str())
    .or_else(|| trimmed.rsplit('/').next())?;
  let lower = file.to_ascii_lowercase();
  let stem = lower
    .strip_suffix(".json")
    .map(|value| value.to_string())?;
  if stem.is_empty() {
    return None;
  }
  // Preserve original stem casing from the filename when possible.
  let original_stem = file
    .get(..stem.len())
    .filter(|value| value.len() == stem.len())
    .unwrap_or(stem.as_str());
  Some(original_stem.to_string())
}

pub fn display_name_for_source_url(url: &str) -> String {
  if let Some(slug) = json_slug_from_url(url) {
    return polish_source_display_name(&slug);
  }
  if let Some(path) = resolve_local_catalog_path(url) {
    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
      return polish_source_display_name(stem);
    }
  }
  let lower = url.to_lowercase();
  if lower.contains("fitgirl-repacks.site") || lower.contains("fitgirl") {
    return "FitGirl".to_string();
  }
  "Fonte personalizada".to_string()
}

/// Nome amigável: prioriza o `name` do JSON, depois API, depois a URL.
pub fn resolve_source_display_name(
  catalog_name: Option<&str>,
  api_name: Option<&str>,
  url_or_path: &str,
) -> String {
  for candidate in [catalog_name, api_name] {
    if let Some(name) = candidate.map(str::trim).filter(|value| !value.is_empty()) {
      return polish_source_display_name(name);
    }
  }
  display_name_for_source_url(url_or_path)
}

pub fn polish_source_display_name(name: &str) -> String {
  let trimmed = name.trim();
  if trimmed.is_empty() {
    return "Fonte personalizada".to_string();
  }

  let without_ext = trimmed
    .strip_suffix(".json")
    .or_else(|| trimmed.strip_suffix(".JSON"))
    .unwrap_or(trimmed)
    .trim();
  if without_ext.is_empty() {
    return "Fonte personalizada".to_string();
  }

  humanize_source_slug(without_ext)
}

fn humanize_source_slug(slug: &str) -> String {
  match slug.to_ascii_lowercase().as_str() {
    "fitgirl" => return "FitGirl".to_string(),
    "xatab" => return "XATAB".to_string(),
    "dodi" => return "DODI".to_string(),
    "steamrip" => return "SteamRip".to_string(),
    "gog" => return "GOG".to_string(),
    "onlinefix" | "online-fix" => return "Online-Fix".to_string(),
    "kaoskrew" | "kaos-krew" => return "KaOsKrew".to_string(),
    "elamigos" => return "ElAmigos".to_string(),
    "atop" => return "ATOP".to_string(),
    "empress" => return "EMPRESS".to_string(),
    _ => {}
  }

  // Já parece um nome legível (espaços ou maiúsculas no meio).
  if slug.contains(' ')
    || slug.chars().any(|c| c.is_ascii_uppercase()) && slug.chars().any(|c| c.is_ascii_lowercase())
  {
    return slug.to_string();
  }

  let normalized = slug.replace(['-', '_'], " ");
  if normalized
    .chars()
    .all(|c| c.is_ascii_uppercase() || !c.is_alphabetic())
  {
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
  read_catalog_from_db_conn(&conn, source_id)
}

fn read_catalog_from_db_conn(conn: &Connection, source_id: &str) -> Option<HydraLinksCatalog> {
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

  Ok(())
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

/// Remove o `.json` da fonte na pasta `catalogs/` da app (não apaga ficheiros fora dessa pasta).
pub fn delete_source_catalog_json_file(app: &AppHandle, source: &crate::dto::HydraSourceDto) {
  let Ok(cache_dir) = catalog_cache_dir(app) else {
    return;
  };
  let Ok(cache_dir) = cache_dir.canonicalize() else {
    return;
  };

  let mut candidates: Vec<PathBuf> = Vec::new();
  if let Ok(path) = resolve_local_catalog_path_for_write(&source.url) {
    candidates.push(path);
  }
  if let Some(remote) = source
    .remote_url
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
  {
    if let Ok(path) = catalog_cache_path_for_remote_url(app, remote) {
      candidates.push(path);
    }
  }
  if let Ok(path) = resolve_api_cache_json_path(app, &source.id, &source.url) {
    candidates.push(path);
  }

  let mut seen = HashSet::new();
  for path in candidates {
    let Ok(canonical) = path.canonicalize() else {
      continue;
    };
    if !seen.insert(canonical.clone()) {
      continue;
    }
    if !canonical.starts_with(&cache_dir) {
      continue;
    }
    if canonical
      .extension()
      .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
    {
      match std::fs::remove_file(&canonical) {
        Ok(()) => eprintln!("catalog_json_deleted: {}", canonical.display()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
          eprintln!(
            "catalog_json_delete_failed: {} — {error}",
            canonical.display()
          );
        }
      }
    }
  }
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

pub fn hydralinks_mirror_url_for_file(file_name: &str) -> Option<String> {
  let template = std::env::var(config::HYDRALINKS_MIRROR_URL_ENV)
    .ok()?
    .trim()
    .to_string();
  if template.is_empty() {
    return None;
  }
  if template.contains("{file}") {
    Some(template.replace("{file}", file_name))
  } else {
    Some(format!(
      "{}/{}",
      template.trim_end_matches('/'),
      file_name
    ))
  }
}

fn catalog_fetch_candidates(source: &HydraSourceDto) -> Result<Vec<(String, String)>, String> {
  let remote = resolve_remote_catalog_url(source).ok_or_else(|| {
    "Não foi possível determinar a URL remota desta fonte.".to_string()
  })?;
  let normalized = normalize_remote_catalog_url(&remote)?;
  let mut candidates = vec![("URL oficial".to_string(), normalized.clone())];

  if let Ok(file_name) = catalog_file_name_from_path(&normalized) {
    if let Some(mirror) = hydralinks_mirror_url_for_file(&file_name) {
      if mirror != normalized {
        candidates.push(("espelho configurado".to_string(), mirror));
      }
    }
  }

  Ok(candidates)
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

fn remote_fetch_error(label: &str, status: reqwest::StatusCode) -> String {
  if status.as_u16() == 403 {
    return format!("{label}: bloqueado (Cloudflare 403)");
  }
  format!("{label}: HTTP {status}")
}

async fn fetch_remote_catalog_body(remote_url: &str, label: &str) -> Result<String, String> {
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
    .map_err(|error| format!("{label}: falha ao baixar ({error})"))?;

  if !response.status().is_success() {
    return Err(remote_fetch_error(label, response.status()));
  }

  response
    .text()
    .await
    .map_err(|error| format!("{label}: não foi possível ler a resposta ({error})"))
}

async fn fetch_catalog_body_from_candidates(
  candidates: &[(String, String)],
) -> Result<(String, String), String> {
  let mut errors: Vec<String> = Vec::new();

  for (label, url) in candidates {
    match fetch_remote_catalog_body(url, label).await {
      Ok(body) if looks_like_html_catalog(&body) => {
        errors.push(format!("{label}: resposta HTML inválida"));
      }
      Ok(body) => match parse_catalog_json(&body) {
        Ok(_) => return Ok((body, label.clone())),
        Err(error) => errors.push(format!("{label}: {error}")),
      },
      Err(error) => errors.push(error),
    }
  }

  Err(format!(
    "Não foi possível baixar o catálogo online. {}",
    errors.join(" · ")
  ))
}

async fn fetch_catalog_body_for_source(source: &HydraSourceDto) -> Result<(String, String), String> {
  let candidates = catalog_fetch_candidates(source)?;
  fetch_catalog_body_from_candidates(&candidates).await
}

/// Resultado de sync: actualizado, já em dia, ou só offline.
pub enum SyncCatalogOutcome {
  Updated(usize),
  Unchanged(usize),
  OfflineOnly { count: usize, warning: String },
}

/// Descarrega o catálogo online, grava no ficheiro local e importa.
/// Prioridade: cache local → download inteligente → API Hydra (metadados).
pub async fn sync_source_catalog_from_remote(
  app: &AppHandle,
  source: &HydraSourceDto,
) -> Result<(SyncCatalogOutcome, Option<super::hydra::HydraApiDownloadSource>), String> {
  let source_id = source.id.as_str();
  let hydralinks_url = resolve_remote_catalog_url(source)
    .or_else(|| source.remote_url.clone())
    .or_else(|| hydralinks_remote_url_for_local_path(&source.url));

  let mut api_warning: Option<String> = None;
  let api_meta = if let Some(ref catalog_url) = hydralinks_url {
    match super::hydra::hydra_refresh_download_source_meta(
      catalog_url,
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
    }
  } else {
    None
  };

  if hydralinks_url.is_some() {
    if let Ok(local_path) = resolve_local_catalog_path_for_write(&source.url) {
      match fetch_catalog_body_for_source(source).await {
        Ok((body, _label)) => {
          if let (Some(meta), Ok(conn)) = (&api_meta, open_database_connection(app)) {
            let unchanged_fp = source
              .fingerprint
              .as_deref()
              .filter(|value| super::hydra::is_catalog_content_fingerprint(value))
              .is_some_and(|stored| meta.fingerprint.as_deref() == Some(stored));
            let unchanged_hash =
              stored_payload_hash(&conn, source_id).as_deref() == Some(payload_hash(&body).as_str());
            if unchanged_fp && unchanged_hash && has_local_catalog(app, source_id) {
              let local_count = conn
                .query_row(
                  "SELECT COUNT(*) FROM hydra_catalog_entries WHERE source_id = ?1",
                  params![source_id],
                  |row| row.get::<_, i64>(0),
                )
                .unwrap_or(0)
                .max(0) as usize;
              // Prioridade: contagem da API Hydra.
              let count = if meta.download_count > 0 {
                meta.download_count.max(0) as usize
              } else {
                local_count
              };
              return Ok((SyncCatalogOutcome::Unchanged(count), api_meta.clone()));
            }
          }
          return apply_downloaded_catalog_body(
            app,
            source_id,
            source.url.as_str(),
            &local_path,
            &body,
            api_meta,
          );
        }
        Err(download_error) => {
          if has_local_catalog(app, source_id) {
            let detail = match api_warning {
              Some(api) => format!("API Hydra: {api} · Download: {download_error}"),
              None => download_error,
            };
            return download_catalog_fallback(app, source_id, Some(detail));
          }
        }
      }
    }
  }

  if let Some(meta) = api_meta {
    let count = meta.download_count.max(0) as usize;
    let unchanged = source
      .fingerprint
      .as_deref()
      .filter(|value| super::hydra::is_catalog_content_fingerprint(value))
      .is_some_and(|stored| meta.fingerprint.as_deref() == Some(stored));
    let outcome = if unchanged {
      SyncCatalogOutcome::Unchanged(count)
    } else {
      SyncCatalogOutcome::Updated(count)
    };
    return Ok((outcome, Some(meta)));
  }

  Err(api_warning.unwrap_or_else(|| {
    "Não foi possível atualizar: sem catálogo local e sem conexão com a API Hydra.".to_string()
  }))
}

/// Baixa catálogo remoto: prioriza JSON local; API Hydra é complementar.
pub async fn import_source_catalog_from_remote_url(
  app: &AppHandle,
  source_id: &str,
  remote_url: &str,
  cache_path: &str,
) -> Result<(usize, Option<super::hydra::HydraApiDownloadSource>), String> {
  let normalized_remote = normalize_remote_catalog_url(remote_url)?;
  let path = resolve_local_catalog_path_for_write(cache_path)?;

  let temp_source = HydraSourceDto {
    id: source_id.to_string(),
    name: display_name_for_source_url(&normalized_remote),
    url: cache_path.trim().to_string(),
    status: "MATCHED".to_string(),
    download_count: 0,
    fingerprint: None,
    api_source_id: None,
    remote_url: Some(normalized_remote.clone()),
    created_at: String::new(),
  };

  let json_result = fetch_catalog_body_for_source(&temp_source).await;
  let api_meta = super::hydra::hydra_refresh_download_source_meta(&normalized_remote, None, None)
    .await
    .ok();

  if let Ok((body, _label)) = json_result {
    let outcome = apply_downloaded_catalog_body(
      app,
      source_id,
      cache_path,
      &path,
      &body,
      api_meta.clone(),
    )?;
    let count = match outcome.0 {
      SyncCatalogOutcome::Updated(count) | SyncCatalogOutcome::Unchanged(count) => count,
      SyncCatalogOutcome::OfflineOnly { count, .. } => count,
    };
    return Ok((count, outcome.1.or(api_meta)));
  }

  if let Some(meta) = api_meta {
    let count = meta.download_count.max(0) as usize;
    return Ok((count, Some(meta)));
  }

  let download_error = json_result.err().unwrap_or_default();
  Err(format!(
    "{download_error} Configure HYDRALINKS_MIRROR_URL no .env, importe o .json manualmente, \
ou tente novamente quando a API Hydra estiver disponível."
  ))
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
  remember_in_memory(source_id, catalog.clone());
  if let Some(name) = catalog.name.as_deref() {
    let display = resolve_source_display_name(Some(name), None, local_path);
    if let Ok(conn) = open_database_connection(app) {
      let _ = super::hydra::persist_hydra_source_display_name(&conn, source_id, &display);
    }
  }
  Ok((SyncCatalogOutcome::Updated(count), api_meta))
}

/// Dados preparados ao importar um .json externo (já copiado para `catalogs/`).
pub(crate) struct StagedLocalCatalogImport {
  pub cache_path: String,
  pub body: String,
  pub catalog: HydraLinksCatalog,
  pub count: usize,
}

/// Lê o arquivo externo e copia-o para a pasta interna da aplicação.
pub fn stage_local_catalog_for_import(
  app: &AppHandle,
  file_path: &str,
) -> Result<StagedLocalCatalogImport, String> {
  let path = resolve_local_catalog_path(file_path).ok_or_else(|| {
    format!(
      "Arquivo não encontrado: {file_path}. Confirme que o caminho existe e termina em .json."
    )
  })?;
  let (catalog, body) = read_catalog_file(&path)?;
  let count = catalog.downloads.len();
  let cache_path = catalog_import_cache_path(app, &path, &body)?;
  if let Some(parent) = cache_path.parent() {
    std::fs::create_dir_all(parent)
      .map_err(|error| format!("Não foi possível criar a pasta do catálogo: {error}"))?;
  }
  std::fs::write(&cache_path, &body)
    .map_err(|error| format!("Não foi possível copiar o catálogo para a aplicação: {error}"))?;
  Ok(StagedLocalCatalogImport {
    cache_path: cache_path.to_string_lossy().into_owned(),
    body,
    catalog,
    count,
  })
}

pub fn finalize_local_catalog_import(
  app: &AppHandle,
  source_id: &str,
  staged: &StagedLocalCatalogImport,
) -> Result<(), String> {
  write_catalog_to_db(
    app,
    source_id,
    staged.cache_path.as_str(),
    staged.body.as_str(),
    &staged.catalog,
  )?;
  remember_in_memory(source_id, staged.catalog.clone());
  if let Some(name) = staged.catalog.name.as_deref() {
    let display = resolve_source_display_name(Some(name), None, staged.cache_path.as_str());
    if let Ok(conn) = open_database_connection(app) {
      let _ = super::hydra::persist_hydra_source_display_name(&conn, source_id, &display);
    }
  }
  Ok(())
}

/// Move catálogos antigos (caminho externo) para `catalogs/` da aplicação.
pub fn migrate_external_catalog_to_cache_if_needed(
  app: &AppHandle,
  source: &HydraSourceDto,
) -> Result<Option<String>, String> {
  if !is_local_catalog_path(&source.url) {
    return Ok(None);
  }

  let cache_root = catalog_cache_dir(app)?;
  let path = PathBuf::from(source.url.trim());
  if path.starts_with(&cache_root) {
    return Ok(None);
  }

  let Some(external) = resolve_local_catalog_path(&source.url) else {
    return Ok(None);
  };

  let body = std::fs::read_to_string(&external)
    .map_err(|error| format!("Não foi possível ler o catálogo externo: {error}"))?;
  let cache_path = catalog_import_cache_path(app, &external, &body)?;
  if !cache_path.is_file() || cache_path != external {
    if let Some(parent) = cache_path.parent() {
      std::fs::create_dir_all(parent)
        .map_err(|error| format!("Não foi possível criar a pasta do catálogo: {error}"))?;
    }
    std::fs::write(&cache_path, &body)
      .map_err(|error| format!("Não foi possível copiar o catálogo para a aplicação: {error}"))?;
  }

  let cache_path_str = cache_path.to_string_lossy().into_owned();
  let conn = open_database_connection(app)?;
  conn
    .execute(
      "UPDATE hydra_download_sources SET url = ?1 WHERE id = ?2",
      params![cache_path_str, source.id],
    )
    .map_err(|error| format!("could_not_migrate_catalog_path: {error}"))?;
  conn
    .execute(
      "UPDATE hydra_source_catalogs SET source_url = ?1 WHERE source_id = ?2",
      params![cache_path_str, source.id],
    )
    .ok();

  Ok(Some(cache_path_str))
}

pub fn has_local_catalog(app: &AppHandle, source_id: &str) -> bool {
  if read_memory_cache(source_id).is_some() {
    return true;
  }
  if let Ok(conn) = open_database_connection(app) {
    if let Ok(source) = super::hydra::get_hydra_source_by_id(&conn, source_id) {
      if resolve_local_catalog_path(&source.url).is_some() {
        return true;
      }
    }
  }
  if read_catalog_from_db(app, source_id).is_some() {
    return true;
  }
  if let Ok(conn) = open_database_connection(app) {
    let count: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM hydra_catalog_entries WHERE source_id = ?1",
        params![source_id],
        |row| row.get(0),
      )
      .unwrap_or(0);
    if count > 0 {
      return true;
    }
  }
  false
}

/// Acrescenta resultados da API Hydra ao índice local (cache incremental)
/// e grava/atualiza o `.json` em `catalogs/` para a fonte aparecer na pasta.
pub fn append_catalog_download_options(
  app: &AppHandle,
  source_id: &str,
  source_ref: &str,
  options: &[DownloadOptionDto],
) -> Result<usize, String> {
  if options.is_empty() {
    return Ok(0);
  }

  let conn = open_database_connection(app)?;
  let mut stmt = conn
    .prepare(
      "INSERT INTO hydra_catalog_entries \
       (source_id, title, title_norm, file_size, uris_json, group_key, display_title) \
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 \
       WHERE NOT EXISTS ( \
         SELECT 1 FROM hydra_catalog_entries \
         WHERE source_id = ?1 AND title = ?2 AND uris_json = ?5 \
       )",
    )
    .map_err(|error| format!("could_not_prepare_append_catalog: {error}"))?;

  let mut inserted = 0usize;
  for option in options {
    let title_norm = normalize_match_text(&option.title);
    if title_norm.is_empty() {
      continue;
    }
    let uris_json =
      serde_json::to_string(&[option.url.as_str()]).map_err(|e| format!("encode_uri: {e}"))?;
    let group_key = crate::title::catalog_game_group_key(&option.title);
    let display_title = crate::title::clean_title_for_matching(&option.title);
    let quality = option.quality.trim();
    let file_size = if quality.is_empty() || quality.starts_with("Link ") {
      None
    } else {
      Some(quality.to_string())
    };
    let changed = stmt
      .execute(params![
        source_id,
        option.title,
        title_norm,
        file_size,
        uris_json,
        group_key,
        display_title,
      ])
      .map_err(|error| format!("could_not_append_catalog_entry: {error}"))?;
    if changed > 0 {
      inserted += 1;
    }
  }
  drop(stmt);

  if inserted == 0 {
    return Ok(0);
  }

  let source_name = conn
    .query_row(
      "SELECT name FROM hydra_download_sources WHERE id = ?1",
      params![source_id],
      |row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "Catálogo".to_string());

  let catalog = catalog_from_indexed_entries(&conn, source_id, &source_name)?;
  let body = serde_json::to_string_pretty(&catalog)
    .map_err(|error| format!("could_not_encode_catalog_json: {error}"))?;
  let hash = payload_hash(&body);

  let cache_path = resolve_api_cache_json_path(app, source_id, source_ref)?;
  if let Some(parent) = cache_path.parent() {
    std::fs::create_dir_all(parent)
      .map_err(|error| format!("could_not_create_catalogs_folder: {error}"))?;
  }
  std::fs::write(&cache_path, &body)
    .map_err(|error| format!("could_not_write_catalog_json: {error}"))?;
  let cache_path_str = cache_path.to_string_lossy().into_owned();

  conn
    .execute(
      "INSERT INTO hydra_source_catalogs (source_id, source_url, payload_json, payload_hash, fetched_at) \
       VALUES (?1, ?2, ?3, ?4, ?5) \
       ON CONFLICT(source_id) DO UPDATE SET \
         source_url = excluded.source_url, \
         payload_json = excluded.payload_json, \
         payload_hash = excluded.payload_hash, \
         fetched_at = excluded.fetched_at",
      params![source_id, cache_path_str, body, hash, now_unix_ms()],
    )
    .map_err(|error| format!("could_not_save_source_catalog: {error}"))?;

  let _ = conn.execute(
    "UPDATE hydra_download_sources SET url = ?1, download_count = ?2 WHERE id = ?3",
    params![cache_path_str, catalog.downloads.len() as i64, source_id],
  );

  remember_in_memory(source_id, catalog);

  Ok(inserted)
}

fn catalog_from_indexed_entries(
  conn: &Connection,
  source_id: &str,
  source_name: &str,
) -> Result<HydraLinksCatalog, String> {
  let mut stmt = conn
    .prepare(
      "SELECT title, file_size, uris_json FROM hydra_catalog_entries \
       WHERE source_id = ?1 ORDER BY title COLLATE NOCASE",
    )
    .map_err(|error| format!("could_not_prepare_catalog_entries: {error}"))?;

  let rows = stmt
    .query_map(params![source_id], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, Option<String>>(1)?,
        row.get::<_, String>(2)?,
      ))
    })
    .map_err(|error| format!("could_not_query_catalog_entries: {error}"))?;

  let mut by_title: HashMap<String, HydraLinksDownload> = HashMap::new();
  for row in rows.flatten() {
    let (title, file_size, uris_json) = row;
    let uris: Vec<String> = serde_json::from_str(&uris_json).unwrap_or_default();
    let entry = by_title
      .entry(title.clone())
      .or_insert_with(|| HydraLinksDownload {
        title,
        file_size: None,
        uris: Vec::new(),
        upload_date: None,
      });
    if entry
      .file_size
      .as_ref()
      .map(String::as_str)
      .unwrap_or("")
      .is_empty()
    {
      if let Some(size) = file_size.filter(|value| !value.trim().is_empty()) {
        entry.file_size = Some(size);
      }
    }
    for uri in uris {
      if !entry.uris.iter().any(|existing| existing == &uri) {
        entry.uris.push(uri);
      }
    }
  }

  let mut downloads: Vec<HydraLinksDownload> = by_title.into_values().collect();
  downloads.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));

  Ok(HydraLinksCatalog {
    name: Some(source_name.to_string()),
    downloads,
  })
}

fn resolve_api_cache_json_path(
  app: &AppHandle,
  source_id: &str,
  source_ref: &str,
) -> Result<PathBuf, String> {
  if let Ok(conn) = open_database_connection(app) {
    if let Ok(url) = conn.query_row(
      "SELECT url FROM hydra_download_sources WHERE id = ?1",
      params![source_id],
      |row| row.get::<_, String>(0),
    ) {
      if let Ok(path) = resolve_local_catalog_path_for_write(&url) {
        return Ok(path);
      }
    }
  }

  if is_remote_catalog_url(source_ref) {
    return catalog_cache_path_for_remote_url(app, source_ref);
  }

  if let Ok(path) = resolve_local_catalog_path_for_write(source_ref) {
    return Ok(path);
  }

  let safe_name = source_id
    .chars()
    .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
    .collect::<String>();
  Ok(catalog_cache_dir(app)?.join(format!("{safe_name}.json")))
}

pub fn load_cached_catalog_for_source(
  app: &AppHandle,
  source: &HydraSourceDto,
) -> Option<std::sync::Arc<CachedCatalog>> {
  let path = resolve_local_catalog_path(&source.url);
  let fingerprint = path.as_ref().and_then(|p| file_fingerprint(p));

  if let Some(cached) = read_memory_cache_if_fresh(&source.id, fingerprint.as_ref()) {
    return Some(cached);
  }

  if let Some(path) = path.as_ref() {
    if let Ok((catalog, _)) = read_catalog_file(path) {
      let fp = fingerprint.or_else(|| file_fingerprint(path));
      let indexed = index_catalog(catalog, fp);
      let arc = std::sync::Arc::new(indexed);
      if let Ok(mut cache) = memory_cache().lock() {
        cache.insert(
          source.id.clone(),
          MemoryCacheEntry {
            catalog: arc.clone(),
          },
        );
      }
      return Some(arc);
    }
  }

  if let Some(cached) = read_memory_cache_arc(&source.id) {
    return Some(cached);
  }

  let catalog = read_catalog_from_db(app, &source.id)?;
  let indexed = index_catalog(catalog, None);
  let arc = std::sync::Arc::new(indexed);
  if let Ok(mut cache) = memory_cache().lock() {
    cache.insert(
      source.id.clone(),
      MemoryCacheEntry {
        catalog: arc.clone(),
      },
    );
  }
  Some(arc)
}

fn options_from_cached(
  source: &HydraSourceDto,
  catalog: &CachedCatalog,
  query: &str,
) -> Vec<DownloadOptionDto> {
  let query_norm = normalize_match_text(query);
  if query_norm.is_empty() {
    return Vec::new();
  }

  let source_name = catalog
    .name
    .as_ref()
    .map(|name| name.trim().to_string())
    .filter(|name| !name.is_empty())
    .unwrap_or_else(|| source.name.clone());

  let mut options = Vec::new();
  let mut seen_urls = HashSet::new();
  let mut seen_titles = HashSet::new();

  let candidate_idxs = candidate_indices_for_query(catalog, &query_norm);
  let iter: Box<dyn Iterator<Item = &IndexedDownload>> = if let Some(idxs) = candidate_idxs {
    Box::new(idxs.iter().filter_map(|&i| catalog.downloads.get(i)))
  } else {
    Box::new(catalog.downloads.iter())
  };

  for download in iter {
    if !title_norm_matches_query_norm(&download.title_norm, &query_norm) {
      continue;
    }
    if download.title_norm.is_empty() || !seen_titles.insert(download.title_norm.clone()) {
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

/// Lista opções de download para um jogo a partir dos `.json` locais (não SQLite).
pub fn list_download_options_for_group_key(
  app: &AppHandle,
  sources: &[HydraSourceDto],
  group_key: &str,
) -> Vec<DownloadOptionDto> {
  let group_key = group_key.trim();
  if group_key.is_empty() || sources.is_empty() {
    return Vec::new();
  }
  let query_canon = crate::title::canonical_catalog_group_key(group_key);

  let mut options = Vec::new();
  let mut seen_urls = HashSet::new();
  let mut seen_source_titles = HashSet::new();

  for source in sources {
    let Some(catalog) = load_cached_catalog_for_source(app, source) else {
      continue;
    };
    let source_name = catalog
      .name
      .as_ref()
      .map(|name| name.trim().to_string())
      .filter(|name| !name.is_empty())
      .unwrap_or_else(|| source.name.clone());

    for download in &catalog.downloads {
      let download_canon = crate::title::canonical_catalog_group_key(&download.group_key);
      let matches = download.group_key == group_key
        || download_canon == query_canon
        || crate::title::catalog_search_group_keys_equivalent(&download_canon, &query_canon)
        || crate::title::catalog_search_group_keys_equivalent(&query_canon, &download_canon);
      if !matches {
        continue;
      }
      if download.title_norm.is_empty() {
        continue;
      }
      let source_title_key = format!("{}\0{}", source.id, download.title_norm);
      if !seen_source_titles.insert(source_title_key) {
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
    }
  }

  options.sort_by(|a, b| {
    a.source_name
      .to_lowercase()
      .cmp(&b.source_name.to_lowercase())
      .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
  });
  options
}

pub fn search_json_catalog_source(
  app: &AppHandle,
  source: &HydraSourceDto,
  query: &str,
) -> Vec<DownloadOptionDto> {
  // Fontes importadas (FitGirl, etc.): pesquisar no cache do .json, não no SQLite.
  let Some(catalog) = load_cached_catalog_for_source(app, source) else {
    return Vec::new();
  };
  options_from_cached(source, &catalog, query)
}

/// Pesquisa de títulos no Discover a partir dos `.json` locais (não do índice SQLite).
pub fn search_distinct_catalog_titles_from_json(
  app: &AppHandle,
  sources: &[HydraSourceDto],
  query: &str,
  offset: usize,
  limit: usize,
) -> Vec<CatalogTitleHit> {
  if sources.is_empty() || query.trim().len() < 2 || limit == 0 {
    return Vec::new();
  }

  let query_norm = normalize_match_text(query);
  if query_norm.is_empty() {
    return Vec::new();
  }

  let mut groups: HashMap<String, CatalogTitleHit> = HashMap::new();

  for source in sources {
    let Some(catalog) = load_cached_catalog_for_source(app, source) else {
      continue;
    };
    let source_name = catalog
      .name
      .as_ref()
      .map(|name| name.trim().to_string())
      .filter(|name| !name.is_empty())
      .unwrap_or_else(|| source.name.clone());

    let candidate_idxs = candidate_indices_for_query(&catalog, &query_norm);
    let iter: Box<dyn Iterator<Item = &IndexedDownload>> = if let Some(idxs) = candidate_idxs {
      Box::new(idxs.iter().filter_map(|&i| catalog.downloads.get(i)))
    } else {
      Box::new(catalog.downloads.iter())
    };

    for download in iter {
      if !title_norm_matches_query_norm(&download.title_norm, &query_norm) {
        continue;
      }
      if download.group_key.is_empty() {
        continue;
      }
      let canonical_key =
        crate::title::canonical_catalog_group_key(&download.group_key);
      let bucket_key = groups
        .keys()
        .find(|existing| {
          crate::title::catalog_search_group_keys_equivalent(existing, &canonical_key)
            || crate::title::catalog_search_group_keys_equivalent(existing, &download.group_key)
        })
        .cloned()
        .unwrap_or_else(|| canonical_key.clone());

      if let Some(hit) = groups.get_mut(&bucket_key) {
        hit.option_count = hit.option_count.saturating_add(1);
      } else {
        groups.insert(
          bucket_key,
          CatalogTitleHit {
            title: crate::title::catalog_game_display_title_from_group_key(&canonical_key),
            _source_name: source_name.clone(),
            group_key: canonical_key,
            option_count: 1,
          },
        );
      }
    }
  }

  let mut ordered: Vec<CatalogTitleHit> = groups.into_values().collect();
  ordered.sort_by(|a, b| {
    a.title
      .len()
      .cmp(&b.title.len())
      .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
  });
  ordered.into_iter().skip(offset).take(limit).collect()
}

/// Pré-carrega catálogos locais em memória (arranque / após import).
pub fn warm_local_catalog_caches(app: &AppHandle) {
  let Ok(conn) = open_database_connection(app) else {
    return;
  };
  let Ok(sources) = super::hydra::list_hydra_sources(&conn) else {
    return;
  };
  let disabled = crate::db::get_disabled_hydra_source_ids_from_conn(&conn).unwrap_or_default();
  drop(conn);

  for source in sources {
    if disabled.contains(&source.id) {
      continue;
    }
    let _ = load_cached_catalog_for_source(app, &source);
  }
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
  fn detects_remote_catalog_urls() {
    assert!(is_remote_catalog_url(
      "https://hydralinks.cloud/sources/xatab.json"
    ));
    assert!(!is_remote_catalog_url(r"C:\catalogs\xatab.json"));
  }

  #[test]
  fn normalizes_hydralinks_urls_without_sources_segment() {
    assert_eq!(
      normalize_remote_catalog_url("https://hydralinks.cloud/fitgirl.json").expect("normalized"),
      "https://hydralinks.cloud/sources/fitgirl.json"
    );
  }

  #[test]
  fn builds_mirror_url_from_env_template() {
    std::env::set_var(
      "HYDRALINKS_MIRROR_URL",
      "https://mirror.example/{file}",
    );
    assert_eq!(
      hydralinks_mirror_url_for_file("fitgirl.json"),
      Some("https://mirror.example/fitgirl.json".to_string())
    );
    std::env::remove_var("HYDRALINKS_MIRROR_URL");
  }

  #[test]
  fn builds_catalog_fetch_candidates_uses_official_url_only() {
    let source = HydraSourceDto {
      id: "local_test".to_string(),
      name: "FitGirl".to_string(),
      url: r"C:\catalogs\fitgirl.json".to_string(),
      status: "MATCHED".to_string(),
      download_count: 0,
      fingerprint: None,
      api_source_id: None,
      remote_url: Some("https://hydralinks.cloud/sources/fitgirl.json".to_string()),
      created_at: "0".to_string(),
    };
    let candidates = catalog_fetch_candidates(&source).expect("candidates");
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].0, "URL oficial");
    assert!(candidates[0].1.contains("hydralinks.cloud"));
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
    assert_eq!(
      display_name_for_source_url("https://example.com/catalogs/empress.json"),
      "EMPRESS"
    );
  }

  #[test]
  fn prefers_catalog_json_name_over_url_slug() {
    assert_eq!(
      resolve_source_display_name(
        Some("FitGirl Repacks"),
        None,
        "https://cdn.example.com/abc123.json"
      ),
      "FitGirl Repacks"
    );
    assert_eq!(
      resolve_source_display_name(Some("dodi.json"), None, "https://example.com/other.json"),
      "DODI"
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
