use super::matching::title_matches_query;
use crate::dto::{CatalogGameDto, EmbeddedCatalogEntry};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

const EMBEDDED_CATALOG_JSON: &str = include_str!("../../resources/embedded_catalog.json");

pub fn embedded_catalog_entries() -> Vec<EmbeddedCatalogEntry> {
  serde_json::from_str(EMBEDDED_CATALOG_JSON).unwrap_or_else(|_| Vec::new())
}

pub fn stable_embedded_id(title: &str) -> String {
  let mut hasher = DefaultHasher::new();
  title.hash(&mut hasher);
  format!("emb_{:x}", hasher.finish())
}

pub fn steam_grid_cover(app_id: u32) -> String {
  format!(
    "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_600x900.jpg",
    app_id
  )
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
    group_key: None,
  }
}

pub fn filter_embedded_catalog(query_norm: &str) -> Vec<CatalogGameDto> {
  let entries = embedded_catalog_entries();
  if query_norm.is_empty() {
    return entries
      .into_iter()
      .take(24)
      .map(|entry| embedded_entry_to_dto(&entry))
      .collect();
  }
  entries
    .into_iter()
    .filter(|entry| {
      entry.title.to_lowercase().contains(query_norm)
        || entry.genre.to_lowercase().contains(query_norm)
    })
    .map(|entry| embedded_entry_to_dto(&entry))
    .collect()
}

pub fn embedded_cover_for_title(title: &str) -> Option<String> {
  let cleaned = crate::title::clean_title_for_matching(title);
  for candidate in [cleaned.as_str(), title] {
    for entry in embedded_catalog_entries() {
      if title_matches_query(&entry.title, candidate) {
        if let Some(cover) = entry.steam_app_id.map(steam_grid_cover) {
          return Some(cover);
        }
      }
    }
  }
  let title_norm = super::normalize_match_text(&cleaned);
  let mut best: Option<(usize, u32)> = None;
  for entry in embedded_catalog_entries() {
    let Some(app_id) = entry.steam_app_id else { continue };
    let entry_norm = super::normalize_match_text(&entry.title);
    if !entry_norm.is_empty()
      && (title_norm.contains(&entry_norm) || entry_norm.contains(&title_norm))
      && best.map(|(score, _)| entry_norm.len() > score).unwrap_or(true)
    {
      best = Some((entry_norm.len(), app_id));
    }
  }
  best.map(|(_, app_id)| steam_grid_cover(app_id))
}
