use super::{normalize_match_text, steam_grid_cover, title_word_matches_query_word};
use crate::dto::CatalogGameDto;
use std::collections::HashSet;
use std::time::Duration;

fn is_likely_dlc_item(item: &serde_json::Value, title: &str) -> bool {
  let title_norm = title.to_lowercase();
  let dlc_title = [
    " dlc", "dlc ", "soundtrack", "ost", "season pass", "expansion pass",
    "skin pack", "cosmetic pack", "booster pack",
  ]
  .iter()
  .any(|hint| title_norm.contains(hint));
  let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
  let label = item
    .get("type_label")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_lowercase();
  dlc_title || item_type.eq_ignore_ascii_case("dlc") || label.contains("dlc")
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
  let Some(items) = value.get("items").and_then(|v| v.as_array()) else {
    return Ok(Vec::new());
  };
  Ok(items
    .iter()
    .take(24)
    .filter_map(|item| {
      let app_id = item.get("id")?.as_u64()? as u32;
      let title = item.get("name")?.as_str()?.trim().to_string();
      if title.is_empty() || is_likely_dlc_item(item, &title) {
        return None;
      }
      Some(CatalogGameDto {
        id: format!("steam_{app_id}"),
        title,
        genre: "Steam".to_string(),
        cover_url: Some(steam_grid_cover(app_id)),
        local_cover_path: None,
        source: "steam".to_string(),
        option_count: None,
        group_key: None,
      })
    })
    .collect())
}

pub fn steam_search_queries_for_title(title: &str) -> Vec<String> {
  let cleaned = crate::title::clean_title_for_matching(title);
  let simple = crate::title::simplify_source_search_query(title);
  let words: Vec<String> = cleaned.split_whitespace().map(str::to_string).collect();
  let mut out = vec![cleaned, simple];
  if words.len() > 4 {
    out.push(words[..4].join(" "));
  }
  if words.len() > 2 {
    out.push(words[..2].join(" "));
  }
  let mut seen = HashSet::new();
  out.retain(|query| {
    let key = normalize_match_text(query);
    key.len() >= 2 && seen.insert(key)
  });
  out
}

pub fn score_steam_title_match(steam_title: &str, reference_norm: &str) -> u32 {
  let steam_norm = normalize_match_text(steam_title);
  if steam_norm == reference_norm { return 100; }
  if steam_norm.contains(reference_norm) || reference_norm.contains(&steam_norm) { return 50; }
  reference_norm.split_whitespace().filter(|word| word.len() > 2)
    .filter(|word| steam_norm.split_whitespace().any(|sw| title_word_matches_query_word(word, sw)))
    .count() as u32
}
