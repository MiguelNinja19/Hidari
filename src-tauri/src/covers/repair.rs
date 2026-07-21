use rusqlite::{params, Connection};
use std::path::Path;

pub fn repair_corrupt_cover_paths(
  conn: &Connection,
  covers_dir: &Path,
) -> Result<usize, String> {
  let mut stmt = conn
    .prepare("SELECT title_key, local_path FROM game_covers WHERE local_path IS NOT NULL")
    .map_err(|error| format!("could_not_prepare_cover_repair: {error}"))?;
  let rows = stmt.query_map([], |row| {
    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
  })
  .map_err(|error| format!("could_not_query_cover_repair: {error}"))?
  .collect::<Result<Vec<_>, _>>()
  .map_err(|error| format!("could_not_map_cover_repair: {error}"))?;
  let mut repaired = 0;
  for (key, path) in rows {
    if super::is_usable_cover_file(Path::new(&path), covers_dir) {
      continue;
    }
    conn.execute(
      "UPDATE game_covers SET local_path=NULL WHERE title_key=?1",
      params![key],
    ).map_err(|error| format!("could_not_clear_corrupt_cover_path: {error}"))?;
    if super::is_plausible_local_cover_path(&path, covers_dir) {
      super::remove_cover_file(&path);
    }
    repaired += 1;
  }
  Ok(repaired)
}

pub fn repair_corrupt_cover_urls(conn: &Connection) -> Result<usize, String> {
  let mut stmt = conn
    .prepare("SELECT title_key, cover_url FROM game_covers")
    .map_err(|error| format!("could_not_prepare_cover_url_repair: {error}"))?;
  let rows = stmt.query_map([], |row| {
    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
  })
  .map_err(|error| format!("could_not_query_cover_url_repair: {error}"))?
  .collect::<Result<Vec<_>, _>>()
  .map_err(|error| format!("could_not_map_cover_url_repair: {error}"))?;
  let mut repaired = 0;
  for (key, url) in rows {
    if !super::is_plausible_cover_url(&url) {
      conn.execute("DELETE FROM game_covers WHERE title_key=?1", params![key])
        .map_err(|error| format!("could_not_delete_corrupt_cover_url: {error}"))?;
      repaired += 1;
    }
  }
  Ok(repaired)
}
