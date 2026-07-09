use crate::dto::{CatalogGameDto, EmbeddedCatalogEntry, ResolvedGenreDto, ResolveGenresBatchPayload, SearchCatalogPayload};
use crate::db::{get_disabled_hydra_source_ids_from_conn, open_database_connection};
use crate::sources::list_hydra_sources;
use crate::title;
use rusqlite::{params, Connection};
use rusqlite::OptionalExtension;
use std::collections::HashSet;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

pub mod favorites;
pub mod game_detail;
pub mod steam_details;

pub use favorites::{
  add_to_collection, check_catalog_changes, create_collection, delete_collection,
  list_collection_entries, list_collections, list_favorite_catalog_entries, record_catalog_snapshot,
  remove_from_collection, rename_collection, toggle_favorite_catalog_entry,
};
pub use game_detail::get_game_detail;

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
    local_cover_path: None,
    source: "embedded".to_string(),
    option_count: None,
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
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Hidari/1.0")
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
      local_cover_path: None,
      source: "steam".to_string(),
      option_count: None,
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

pub async fn fetch_steam_cover_url_for_title(title: &str) -> Option<String> {
  let queries = steam_search_queries_for_title(title);
  if queries.is_empty() {
    return None;
  }

  let reference_norm = normalize_match_text(&title::clean_title_for_matching(title));
  let mut best_fuzzy: Option<(u32, String)> = None;

  for search_term in queries {
    let games = match fetch_steam_catalog_games(&search_term).await {
      Ok(rows) => rows,
      Err(_) => continue,
    };

    if let Some(game) = games
      .iter()
      .find(|game| title_matches_query(&game.title, &search_term))
    {
      return game.cover_url.clone();
    }

    for game in games {
      let Some(cover_url) = game.cover_url.as_ref().filter(|u| !u.trim().is_empty()) else {
        continue;
      };
      let score = score_steam_title_match(&game.title, &reference_norm);
      if score < 2 {
        continue;
      }
      if best_fuzzy.as_ref().map(|(best, _)| score > *best).unwrap_or(true) {
        best_fuzzy = Some((score, cover_url.clone()));
      }
    }
  }

  best_fuzzy.map(|(_, url)| url)
}

/// Várias tentativas de busca — repacks costumam ter ruído no título.
pub fn steam_search_queries_for_title(title: &str) -> Vec<String> {
  let mut out = Vec::new();
  let cleaned = title::clean_title_for_matching(title);
  if cleaned.len() >= 2 {
    out.push(cleaned.clone());
  }
  let simple = title::simplify_source_search_query(title);
  if simple.len() >= 2 {
    out.push(simple);
  }
  let words: Vec<&str> = cleaned.split_whitespace().collect();
  if words.len() > 4 {
    out.push(words.iter().take(4).copied().collect::<Vec<_>>().join(" "));
  }
  if words.len() > 2 {
    out.push(words.iter().take(2).copied().collect::<Vec<_>>().join(" "));
  }

  let mut seen = HashSet::new();
  out.retain(|query| {
    let key = normalize_match_text(query);
    !key.is_empty() && seen.insert(key)
  });
  out
}

pub fn score_steam_title_match(steam_title: &str, reference_norm: &str) -> u32 {
  if reference_norm.is_empty() {
    return 0;
  }
  let steam_norm = normalize_match_text(steam_title);
  if steam_norm.is_empty() {
    return 0;
  }
  if steam_norm == reference_norm {
    return 100;
  }
  if steam_norm.contains(reference_norm) || reference_norm.contains(&steam_norm) {
    return 50;
  }
  let ref_words: Vec<&str> = reference_norm.split_whitespace().collect();
  let steam_words: Vec<&str> = steam_norm.split_whitespace().collect();
  ref_words
    .iter()
    .filter(|word| word.len() > 2)
    .filter(|word| {
      steam_words
        .iter()
        .any(|sw| title_word_matches_query_word(word, sw))
    })
    .count() as u32
}

pub async fn search_catalog_from_sources(
  app: &AppHandle,
  query: &str,
  offset: usize,
  limit: usize,
  attach_covers: bool,
) -> Result<Vec<CatalogGameDto>, String> {
  let app_bg = app.clone();
  let query_bg = query.to_string();
  let local_games = tokio::task::spawn_blocking({
    let app = app_bg.clone();
    let query = query_bg.clone();
    move || search_catalog_from_sources_sync(&app, &query, offset, limit, false)
  })
  .await
  .map_err(|error| format!("search_catalog_task: {error}"))??;

  let conn = open_database_connection(app)?;
  let hydra_sources = crate::sources::list_hydra_sources(&conn)?;
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn)?;
  let api_sources: Vec<crate::dto::HydraSourceDto> = hydra_sources
    .into_iter()
    .filter(|source| !disabled.contains(&source.id))
    .filter(|source| !crate::sources::has_local_catalog(app, &source.id))
    .filter(|source| {
      source
        .api_source_id
        .as_ref()
        .is_some_and(|value| !value.is_empty())
    })
    .collect();
  drop(conn);

  let mut merged = local_games;
  if !api_sources.is_empty() {
    let api_games = crate::sources::search_catalog_games_via_api(
      &api_sources,
      &query_bg,
      offset,
      limit,
    )
    .await;
    let mut seen: HashSet<String> = merged
      .iter()
      .map(|game| game.title.to_lowercase())
      .collect();
    for game in api_games {
      let key = game.title.to_lowercase();
      if seen.insert(key) {
        merged.push(game);
      }
    }
  }

  if merged.len() > limit {
    merged.truncate(limit);
  }

  if attach_covers {
    crate::covers::attach_cover_urls_to_games(app, &mut merged);
  }

  Ok(merged)
}

pub(crate) fn looks_like_source_label(genre: &str) -> bool {
  let value = genre.trim().to_lowercase();
  if value.is_empty() {
    return true;
  }
  [
    "fitgirl",
    "repack",
    "dodi",
    "elamigos",
    "online-fix",
    "steam",
    "catálogo",
    "catalogo",
  ]
  .iter()
  .any(|hint| value.contains(hint))
}

fn resolve_catalog_genre(conn: &Connection, title: &str) -> String {
  if let Some(genres) = steam_details::cached_genres_for_title(conn, title) {
    return genres.join(", ");
  }
  String::new()
}

#[tauri::command]
pub async fn resolve_game_genres_batch(
  app: AppHandle,
  payload: ResolveGenresBatchPayload,
) -> Result<Vec<ResolvedGenreDto>, String> {
  let titles: Vec<String> = payload
    .titles
    .into_iter()
    .map(|title| title.trim().to_string())
    .filter(|title| !title.is_empty())
    .take(32)
    .collect();

  let mut out = Vec::with_capacity(titles.len());
  let mut pending = titles;
  while !pending.is_empty() {
    let batch: Vec<String> = pending.drain(..pending.len().min(4)).collect();
    let mut handles = Vec::with_capacity(batch.len());
    for title in batch {
      let app = app.clone();
      handles.push(tokio::spawn(async move {
        let genre = match steam_details::resolve_steam_details_for_app(&app, &title).await {
          Some(details) if !details.genres.is_empty() => details.genres.join(", "),
          _ => String::new(),
        };
        ResolvedGenreDto { title, genre }
      }));
    }

    for handle in handles {
      if let Ok(item) = handle.await {
        out.push(item);
      }
    }
  }

  Ok(out)
}

fn search_catalog_from_sources_sync(
  app: &AppHandle,
  query: &str,
  offset: usize,
  limit: usize,
  attach_covers: bool,
) -> Result<Vec<CatalogGameDto>, String> {
  let conn = open_database_connection(app)?;
  let hydra_sources = list_hydra_sources(&conn)?;
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn)?;

  let source_ids: Vec<String> = hydra_sources
    .into_iter()
    .filter(|source| !disabled.contains(&source.id))
    .map(|source| source.id)
    .collect();

  if source_ids.is_empty() {
    return Ok(Vec::new());
  }

  let hits = crate::sources::hydralinks::search_distinct_catalog_titles(
    &conn, &source_ids, query, offset, limit,
  );

  let mut games = hits
    .into_iter()
    .map(|hit| {
      let genre = resolve_catalog_genre(&conn, &hit.title);
      CatalogGameDto {
        id: format!("source:{}", stable_embedded_id(&hit.group_key)),
        title: hit.title,
        genre,
        cover_url: None,
        local_cover_path: None,
        source: "source".to_string(),
        option_count: (hit.option_count > 1).then_some(hit.option_count as u32),
      }
    })
    .collect::<Vec<_>>();

  if attach_covers {
    crate::covers::attach_cover_urls_to_games(app, &mut games);
  }

  Ok(games)
}

#[tauri::command]
pub async fn search_game_catalog(app: AppHandle, payload: SearchCatalogPayload) -> Result<Vec<CatalogGameDto>, String> {
  let trimmed = payload.query.trim();
  let query_norm = trimmed.to_lowercase();
  let only_with_sources = payload.only_with_sources.unwrap_or(false);
  let offset = payload.offset.unwrap_or(0);
  let limit = payload.limit.unwrap_or(24).max(1).min(56);

  if query_norm.len() < 2 {
    return Ok(Vec::new());
  }

  if only_with_sources {
    let attach_covers = payload.attach_covers.unwrap_or(false);
    return search_catalog_from_sources(&app, trimmed, offset, limit, attach_covers).await;
  }

  let mut merged = filter_embedded_catalog(&query_norm);
  let mut seen: HashSet<String> = merged.iter().map(|g| g.title.to_lowercase()).collect();

  let include_steam = payload.include_steam.unwrap_or(true);
  let conn = open_database_connection(&app)?;
  let offline = crate::db::read_app_setting_bool(&conn, "offline_mode", false);
  if !include_steam || offline {
    let out: Vec<CatalogGameDto> = merged.into_iter().take(56).collect();
    return Ok(out);
  }

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

  let out: Vec<CatalogGameDto> = merged.into_iter().skip(offset).take(limit).collect();

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
