use super::{
  fetch_steam_catalog_games, normalize_match_text, score_steam_title_match,
  steam_search_queries_for_title, title_matches_query,
};

pub async fn fetch_steam_cover_url_for_title(title: &str) -> Option<String> {
  let queries = steam_search_queries_for_title(title);
  if queries.is_empty() {
    return None;
  }
  let reference_norm =
    normalize_match_text(&crate::title::clean_title_for_matching(title));
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
      let Some(cover_url) = game.cover_url.as_ref().filter(|url| !url.trim().is_empty()) else {
        continue;
      };
      let score = score_steam_title_match(&game.title, &reference_norm);
      if score >= 2
        && best_fuzzy
          .as_ref()
          .map(|(best, _)| score > *best)
          .unwrap_or(true)
      {
        best_fuzzy = Some((score, cover_url.clone()));
      }
    }
  }
  best_fuzzy.map(|(_, url)| url)
}
