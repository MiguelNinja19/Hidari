use crate::catalog::{
  normalize_match_text, score_steam_title_match, steam_grid_cover,
  steam_search_queries_for_title,
};
use rusqlite::{params, Connection};

fn exact_lookup(conn: &Connection, normalized: &str) -> Option<(u32, String)> {
  conn.query_row(
    "SELECT app_id,name FROM steam_app_index WHERE name_norm=?1 LIMIT 1",
    params![normalized],
    |row| Ok((row.get::<_, i64>(0)? as u32, row.get(1)?)),
  ).ok()
}

fn fuzzy_shortlist(conn: &Connection, pattern: &str) -> Vec<(u32, String)> {
  let Ok(mut stmt) = conn.prepare(
    "SELECT app_id,name FROM steam_app_index WHERE name_norm LIKE ?1 LIMIT 300",
  ) else { return Vec::new() };
  let result = stmt.query_map(params![pattern], |row| {
    Ok((row.get::<_, i64>(0)? as u32, row.get(1)?))
  }).map(|rows| rows.flatten().collect()).unwrap_or_default();
  result
}

fn best_match(candidates: &[(u32, String)], reference: &str) -> Option<(u32, String)> {
  candidates.iter()
    .filter_map(|(id, name)| {
      let score = score_steam_title_match(name, reference);
      (score >= 2).then_some((score, *id, name.clone()))
    })
    .max_by_key(|(score, _, _)| *score)
    .map(|(_, id, name)| (id, name))
}

pub fn lookup_steam_app_id_local(
  conn: &Connection,
  title: &str,
) -> Option<(u32, String)> {
  for query in steam_search_queries_for_title(title) {
    let normalized = normalize_match_text(&query);
    if let Some(hit) = (!normalized.is_empty())
      .then(|| exact_lookup(conn, &normalized))
      .flatten()
    {
      return Some(hit);
    }
  }
  let reference = normalize_match_text(&crate::title::clean_title_for_matching(title));
  let first_word = reference.split_whitespace()
    .find(|word| word.len() >= 4)
    .or_else(|| reference.split_whitespace().next())?;
  best_match(&fuzzy_shortlist(conn, &format!("{first_word}%")), &reference)
    .or_else(|| best_match(
      &fuzzy_shortlist(conn, &format!("%{first_word}%")),
      &reference,
    ))
}

pub fn resolve_cover_via_local_index(conn: &Connection, title: &str) -> Option<String> {
  lookup_steam_app_id_local(conn, title).map(|(id, _)| steam_grid_cover(id))
}

pub fn resolve_cover_via_local_index_exact(
  conn: &Connection,
  title: &str,
) -> Option<String> {
  steam_search_queries_for_title(title).into_iter().find_map(|query| {
    let normalized = normalize_match_text(&query);
    exact_lookup(conn, &normalized).map(|(id, _)| steam_grid_cover(id))
  })
}
