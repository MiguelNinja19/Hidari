use rusqlite::Connection;
use std::collections::HashSet;
use std::path::Path;

fn distinct_catalog_titles(conn: &Connection) -> Result<Vec<String>, String> {
  let mut stmt = conn
    .prepare("SELECT DISTINCT title FROM hydra_catalog_entries ORDER BY title COLLATE NOCASE")
    .map_err(|error| format!("could_not_prepare_catalog_titles: {error}"))?;
  let result = stmt
    .query_map([], |row| row.get::<_, String>(0))
    .map_err(|error| format!("could_not_query_catalog_titles: {error}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| format!("could_not_map_catalog_titles: {error}"));
  result
}

fn cached_title_keys(conn: &Connection, dir: &Path) -> Result<HashSet<String>, String> {
  let mut stmt = conn
    .prepare("SELECT title_key,local_path FROM game_covers WHERE local_path IS NOT NULL")
    .map_err(|error| format!("could_not_prepare_cached_covers: {error}"))?;
  let rows = stmt
    .query_map([], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
    })
    .map_err(|error| format!("could_not_query_cached_covers: {error}"))?;
  let mut keys = HashSet::new();
  for (key, path) in rows.flatten() {
    if path
      .as_deref()
      .is_some_and(|path| super::super::is_usable_cover_file(Path::new(path), dir))
    {
      keys.insert(key);
    }
  }
  Ok(keys)
}

pub(crate) fn titles_pending_precache(
  conn: &Connection,
  dir: &Path,
) -> Result<Vec<String>, String> {
  let cached = cached_title_keys(conn, dir)?;
  Ok(distinct_catalog_titles(conn)?
    .into_iter()
    .filter(|title| {
      let key = crate::title::normalize_title_key(title);
      !key.is_empty()
        && !cached.contains(&key)
        && !super::super::should_skip_cover_resolve(conn, &key)
    })
    .collect())
}

pub fn count_catalog_titles(conn: &Connection) -> Result<usize, String> {
  conn.query_row(
    "SELECT COUNT(DISTINCT title) FROM hydra_catalog_entries",
    [],
    |row| row.get(0),
  ).map_err(|error| format!("could_not_count_catalog_titles: {error}"))
}

pub fn count_cached_covers(conn: &Connection, dir: &Path) -> Result<usize, String> {
  Ok(cached_title_keys(conn, dir)?.len())
}
