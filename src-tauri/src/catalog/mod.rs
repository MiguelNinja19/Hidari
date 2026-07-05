use crate::dto::{CatalogGameDto, EmbeddedCatalogEntry, HydraSourceDto, SearchCatalogPayload};
use crate::db::{get_disabled_hydra_source_ids_from_conn, open_database_connection};
use crate::sources::fitgirl::filter_catalog_with_sources;
use crate::sources::{list_hydra_sources, search_download_options_from_local_sources};
use crate::title;
use rusqlite::{params, Connection};
use rusqlite::OptionalExtension;
use std::collections::{HashMap, HashSet};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const EMBEDDED_CATALOG_JSON: &str = include_str!("../../resources/embedded_catalog.json");

pub fn normalize_match_text(value: &str) -> String {
  value
    .to_lowercase()
    .replace(['™', '®', '©', '–', '—', '-', ':', ',', '.', '\'', '"', '’'], " ")
    .chars()
    .filter(|c| c.is_alphanumeric() || c.is_whitespace())
    .collect::<String>()
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ")
}

pub fn title_word_matches_query_word(title_word: &str, query_word: &str) -> bool {
  if title_word == query_word {
    return true;
  }
  // Ex.: "hades" casa com "hadesii" raro; prefixo só se a palavra do título começa com a query completa.
  query_word.len() >= 4 && title_word.starts_with(query_word)
}

pub fn title_matches_query(title: &str, query: &str) -> bool {
  let title_norm = normalize_match_text(title);
  let query_norm = normalize_match_text(query);
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
async fn apply_catalog_source_filter(
  app: &AppHandle,
  games: Vec<CatalogGameDto>,
) -> Vec<CatalogGameDto> {
  let conn = match open_database_connection(app) {
    Ok(conn) => conn,
    Err(_) => return games,
  };
  let hydra_sources = list_hydra_sources(&conn).unwrap_or_default();
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn).unwrap_or_default();
  drop(conn);

  let active_sources: Vec<HydraSourceDto> = hydra_sources
    .into_iter()
    .filter(|source| !disabled.contains(&source.id))
    .collect();
  if active_sources.is_empty() {
    return Vec::new();
  }

  filter_catalog_with_sources(games, &active_sources).await
}

pub fn embedded_catalog_entries() -> Vec<EmbeddedCatalogEntry> {
  serde_json::from_str(EMBEDDED_CATALOG_JSON).unwrap_or_else(|_| Vec::new())
}

pub fn stable_embedded_id(title: &str) -> String {
  let mut hasher = DefaultHasher::new();
  title.hash(&mut hasher);
  format!("emb_{:x}", hasher.finish())
}

/// Cápsula vertical otimizada para grelha (~600×900). Mais leve que a variante @2x.
pub fn steam_grid_cover(app_id: u32) -> String {
  format!(
    "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_600x900.jpg",
    app_id
  )
}

pub fn is_likely_dlc_item(item: &serde_json::Value, title: &str) -> bool {
  let title_norm = title.to_lowercase();
  if title_norm.contains(" dlc")
    || title_norm.contains("dlc ")
    || title_norm.contains("soundtrack")
    || title_norm.contains("ost")
    || title_norm.contains("season pass")
    || title_norm.contains("expansion pass")
    || title_norm.contains("skin pack")
    || title_norm.contains("cosmetic pack")
    || title_norm.contains("booster pack")
  {
    return true;
  }

  let item_type = item
    .get("type")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_lowercase();
  if item_type == "dlc" {
    return true;
  }

  let item_type_label = item
    .get("type_label")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_lowercase();
  if item_type_label.contains("dlc") {
    return true;
  }

  false
}

pub fn embedded_entry_to_dto(entry: &EmbeddedCatalogEntry) -> CatalogGameDto {
  CatalogGameDto {
    id: stable_embedded_id(&entry.title),
    title: entry.title.clone(),
    genre: entry.genre.clone(),
    cover_url: entry.steam_app_id.map(steam_grid_cover),
    source: "embedded".to_string(),
  }
}

pub fn filter_embedded_catalog(query_norm: &str) -> Vec<CatalogGameDto> {
  let entries = embedded_catalog_entries();
  let mut out = Vec::new();
  if query_norm.is_empty() {
    for e in entries.into_iter().take(24) {
      out.push(embedded_entry_to_dto(&e));
    }
    return out;
  }
  for e in entries {
    let t = e.title.to_lowercase();
    let g = e.genre.to_lowercase();
    if t.contains(query_norm) || g.contains(query_norm) {
      out.push(embedded_entry_to_dto(&e));
    }
  }
  out
}

pub fn steam_cache_get(conn: &Connection, query_norm: &str) -> Option<Vec<CatalogGameDto>> {
  let now = i64::try_from(
    SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .ok()?
      .as_secs(),
  )
  .ok()?;
  let row_result = conn.query_row(
    "SELECT payload_json, fetched_ts FROM catalog_steam_cache WHERE query_norm = ?1",
    params![query_norm],
    |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
  );
  let (json, ts) = match row_result.optional() {
    Ok(Some(pair)) => pair,
    Ok(None) | Err(_) => return None,
  };
  if now - ts > 86_400 {
    return None;
  }
  serde_json::from_str(&json).ok()
}

pub fn steam_cache_put(conn: &Connection, query_norm: &str, games: &[CatalogGameDto]) -> Result<(), String> {
  let json = serde_json::to_string(games).map_err(|e| format!("steam_cache_encode: {e}"))?;
  let ts = i64::try_from(
    SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap_or_default()
      .as_secs(),
  )
  .unwrap_or(0);
  conn
    .execute(
      "INSERT INTO catalog_steam_cache (query_norm, payload_json, fetched_ts) VALUES (?1, ?2, ?3) \
       ON CONFLICT(query_norm) DO UPDATE SET \
       payload_json = excluded.payload_json, fetched_ts = excluded.fetched_ts",
      params![query_norm, json, ts],
    )
    .map_err(|e| format!("steam_cache_put: {e}"))?;
  Ok(())
}

pub async fn fetch_steam_catalog_games(search_term: &str) -> Result<Vec<CatalogGameDto>, String> {
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(4))
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Hydra-Tauri-Launcher/1.0")
    .build()
    .map_err(|e| format!("steam_client_build: {e}"))?;

  let response = client
    .get(crate::config::STEAM_STORE_SEARCH_URL)
    .query(&[("term", search_term), ("cc", "US"), ("l", "en")])
    .send()
    .await
    .map_err(|e| format!("steam_catalog_request_failed: {e}"))?;

  if !response.status().is_success() {
    return Err(format!("steam_catalog_http_{}", response.status()));
  }

  let value: serde_json::Value = response
    .json()
    .await
    .map_err(|e| format!("steam_catalog_parse_failed: {e}"))?;

  let mut out = Vec::new();
  let Some(items) = value.get("items").and_then(|v| v.as_array()) else {
    return Ok(out);
  };

  for item in items.iter().take(24) {
    let Some(app_id) = item.get("id").and_then(|v| v.as_u64()).map(|v| v as u32) else {
      continue;
    };
    let title = item
      .get("name")
      .and_then(|v| v.as_str())
      .unwrap_or("")
      .trim()
      .to_string();
    if title.is_empty() {
      continue;
    }
    if is_likely_dlc_item(item, &title) {
      continue;
    }
    let cover = Some(steam_grid_cover(app_id));

    out.push(CatalogGameDto {
      id: format!("steam_{app_id}"),
      title,
      genre: "Steam".to_string(),
      cover_url: cover,
      source: "steam".to_string(),
    });
  }

  Ok(out)
}

pub fn embedded_cover_for_title(title: &str) -> Option<String> {
  let cleaned = title::clean_title_for_matching(title);
  for candidate in [cleaned.as_str(), title] {
    for entry in embedded_catalog_entries() {
      if title_matches_query(&entry.title, candidate) {
        if let Some(cover) = entry.steam_app_id.map(steam_grid_cover) {
          return Some(cover);
        }
      }
    }
  }

  let title_norm = normalize_match_text(&cleaned);
  if title_norm.is_empty() {
    return None;
  }

  let mut best: Option<(usize, u32)> = None;
  for entry in embedded_catalog_entries() {
    let Some(app_id) = entry.steam_app_id else {
      continue;
    };
    let entry_norm = normalize_match_text(&entry.title);
    if entry_norm.is_empty() {
      continue;
    }
    let matches = title_norm.contains(&entry_norm) || entry_norm.contains(&title_norm);
    if !matches {
      continue;
    }
    let score = entry_norm.len();
    if best.map(|(best_score, _)| score > best_score).unwrap_or(true) {
      best = Some((score, app_id));
    }
  }

  best.map(|(_, app_id)| steam_grid_cover(app_id))
}

pub fn cover_resolve_cache() -> &'static Mutex<HashMap<String, Option<String>>> {
  static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
  CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn cover_cache_get(key: &str) -> Option<Option<String>> {
  cover_resolve_cache()
    .lock()
    .ok()
    .and_then(|cache| cache.get(key).cloned())
}

pub fn cover_cache_put(key: String, value: Option<String>) {
  if let Ok(mut cache) = cover_resolve_cache().lock() {
    cache.insert(key, value);
  }
}

pub async fn fetch_steam_cover_url_for_title(title: &str) -> Option<String> {
  let cleaned = title::clean_title_for_matching(title);
  if cleaned.len() < 2 {
    return None;
  }
  let games = fetch_steam_catalog_games(&cleaned).await.ok()?;
  games
    .into_iter()
    .find(|game| title_matches_query(&game.title, &cleaned))
    .and_then(|game| game.cover_url)
}

pub async fn resolve_repack_cover_url(title: &str, source_cover: Option<String>) -> Option<String> {
  if let Some(url) = source_cover.filter(|value| !value.trim().is_empty()) {
    return Some(url);
  }

  let cache_key = normalize_match_text(title);
  if !cache_key.is_empty() {
    if let Some(cached) = cover_cache_get(&cache_key) {
      return cached;
    }
  }

  let resolved = if let Some(url) = embedded_cover_for_title(title) {
    Some(url)
  } else {
    fetch_steam_cover_url_for_title(title).await
  };

  if !cache_key.is_empty() {
    cover_cache_put(cache_key, resolved.clone());
  }

  resolved
}

pub async fn search_catalog_from_sources(app: &AppHandle, query: &str) -> Result<Vec<CatalogGameDto>, String> {
  let conn = open_database_connection(app)?;
  let hydra_sources = list_hydra_sources(&conn)?;
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn)?;
  drop(conn);

  let active_sources: Vec<HydraSourceDto> = hydra_sources
    .into_iter()
    .filter(|source| !disabled.contains(&source.id))
    .collect();

  if active_sources.is_empty() {
    return Ok(Vec::new());
  }

  let options = search_download_options_from_local_sources(query, &active_sources).await;
  let mut seen = HashSet::new();
  let mut games = Vec::new();
  let mut pending_covers: Vec<(usize, String, Option<String>)> = Vec::new();

  for option in options {
    if option.download_type != "torrent" {
      continue;
    }
    let key = normalize_match_text(&option.title);
    if key.is_empty() || seen.contains(&key) {
      continue;
    }
    seen.insert(key);

    let title = option.title;
    let source_cover = option.cover_url.clone();
    games.push(CatalogGameDto {
      id: format!("source:{}", stable_embedded_id(&title)),
      title: title.clone(),
      genre: option.source_name,
      cover_url: None,
      source: "source".to_string(),
    });
    pending_covers.push((games.len() - 1, title, source_cover));

    if games.len() >= 56 {
      break;
    }
  }

  for chunk in pending_covers.chunks(4) {
    let mut handles = Vec::new();
    for (index, title, source_cover) in chunk {
      let title = title.clone();
      let source_cover = source_cover.clone();
      handles.push((
        *index,
        tauri::async_runtime::spawn(async move {
          resolve_repack_cover_url(&title, source_cover).await
        }),
      ));
    }
    for (index, handle) in handles {
      if let Ok(url) = handle.await {
        if let Some(game) = games.get_mut(index) {
          game.cover_url = url;
        }
      }
    }
  }

  Ok(games)
}

#[tauri::command]
pub async fn resolve_game_cover_url(title: String) -> Result<Option<String>, String> {
  Ok(resolve_repack_cover_url(title.trim(), None).await)
}

#[tauri::command]
pub async fn search_game_catalog(app: AppHandle, payload: SearchCatalogPayload) -> Result<Vec<CatalogGameDto>, String> {
  let trimmed = payload.query.trim();
  let query_norm = trimmed.to_lowercase();
  let only_with_sources = payload.only_with_sources.unwrap_or(false);

  if query_norm.len() < 2 {
    return Ok(Vec::new());
  }

  if only_with_sources {
    return search_catalog_from_sources(&app, trimmed).await;
  }

  let mut merged = filter_embedded_catalog(&query_norm);
  let mut seen: HashSet<String> = merged.iter().map(|g| g.title.to_lowercase()).collect();

  let include_steam = payload.include_steam.unwrap_or(true);
  if !include_steam {
    let out: Vec<CatalogGameDto> = merged.into_iter().take(56).collect();
    return Ok(out);
  }

  let conn = open_database_connection(&app)?;

  let steam_chunk = if let Some(cached) = steam_cache_get(&conn, &query_norm) {
    cached
  } else {
    drop(conn);
    let fetched = fetch_steam_catalog_games(trimmed).await.unwrap_or_default();
    if !fetched.is_empty() {
      if let Ok(conn) = open_database_connection(&app) {
        let _ = steam_cache_put(&conn, &query_norm, &fetched);
      }
    }
    fetched
  };

  for game in steam_chunk {
    let key = game.title.to_lowercase();
    if seen.contains(&key) {
      continue;
    }
    seen.insert(key);
    merged.push(game);
    if merged.len() >= 56 {
      break;
    }
  }

  let mut out: Vec<CatalogGameDto> = merged.into_iter().take(56).collect();
  if only_with_sources {
    out = apply_catalog_source_filter(&app, out).await;
  }

  Ok(out)
}

#[cfg(test)]
mod search_match_tests {
  use crate::catalog::{title_matches_query, title_word_matches_query_word};

  #[test]
  fn hades_does_not_match_shades_or_shadespire() {
    assert!(!title_matches_query(
      "OUTBREAK: SHADES OF HORROR - CHROMATIC SPLIT",
      "HADES",
    ));
    assert!(!title_matches_query(
      "WARHAMMER UNDERWORLDS: SHADESPIRE EDITION - V1.8.7 + ALL DLCS",
      "HADES",
    ));
  }

  #[test]
  fn hades_matches_hades_titles() {
    assert!(title_matches_query(
      "HADES - V1.35966 (V1.0) + BONUS SOUNDTRACK",
      "HADES",
    ));
    assert!(title_matches_query("HADES II - V1.137792 + BONUS OST", "HADES"));
  }

  #[test]
  fn substring_hades_inside_shades_is_rejected() {
    assert!(!title_word_matches_query_word("shades", "hades"));
    assert!(!title_word_matches_query_word("shadespire", "hades"));
    assert!(title_word_matches_query_word("hades", "hades"));
  }
}
