use rusqlite::{params, Connection};

pub fn lookup_cover_row(
  conn: &Connection,
  title_key: &str,
) -> Option<(String, Option<String>)> {
  conn.query_row(
    "SELECT cover_url,local_path FROM game_covers WHERE title_key=?1",
    params![title_key],
    |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
  ).ok().filter(|(url, _)| super::is_plausible_cover_url(url))
}

pub fn lookup_cover_row_for_title(
  conn: &Connection,
  title: &str,
) -> Option<(String, Option<String>)> {
  let title = title.trim();
  if title.is_empty() {
    return None;
  }
  for key in crate::title::cover_title_key_candidates(title) {
    if let Some(row) = lookup_cover_row(conn, &key) {
      return Some(row);
    }
  }
  lookup_related(conn, &crate::title::cover_storage_key(title))
}

fn lookup_related(conn: &Connection, group: &str) -> Option<(String, Option<String>)> {
  if group.is_empty() {
    return None;
  }
  let mut stmt = conn.prepare(
    "SELECT title_key,cover_url,local_path FROM game_covers \
     WHERE title_key=?1 OR title_key LIKE ?2",
  ).ok()?;
  let rows = stmt.query_map(params![group, format!("{group} %")], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, Option<String>>(2)?,
    ))
  }).ok()?;
  let result = rows.flatten().find_map(|(key, url, local)| {
    (super::is_plausible_cover_url(&url) && keys_same_game(group, &key))
      .then_some((url, local))
  });
  result
}

fn is_noise(token: &str) -> bool {
  let token = token.to_lowercase();
  let version = token.starts_with('v')
    && token[1..].chars().all(|ch| ch.is_ascii_digit() || ch == '.');
  let numeric = token.chars().all(|ch| ch.is_ascii_digit() || ch == '.');
  let labels = [
    "fitgirl", "dodi", "empress", "reloaded", "codex", "plaza", "skidrow",
    "gog", "online", "fix", "crack", "cracked", "portable", "repost",
    "repack", "update", "updates", "dlc", "dlcs", "bonus", "bonuses",
    "build", "builds", "patch", "multi",
  ];
  version || numeric || labels.contains(&token.as_str()) || token.starts_with("multi")
}

fn keys_same_game(group: &str, stored: &str) -> bool {
  if stored == group
    || crate::title::canonical_catalog_group_key(stored) == group
    || crate::title::catalog_search_group_keys_equivalent(group, stored)
  {
    return true;
  }
  stored.strip_prefix(group)
    .is_some_and(|rest| rest.starts_with(' ') && rest.split_whitespace().all(is_noise))
}
