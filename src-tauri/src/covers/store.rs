use rusqlite::{params, Connection};

pub fn upsert_game_cover(
  conn: &Connection,
  title: &str,
  cover_url: &str,
) -> Result<Option<String>, String> {
  let key = crate::title::cover_storage_key(title);
  if key.is_empty() || !super::is_plausible_cover_url(cover_url) {
    return Ok(None);
  }
  let url = cover_url.trim();
  let stale = conn.query_row(
    "SELECT local_path FROM game_covers WHERE title_key=?1 AND cover_url!=?2",
    params![key, url],
    |row| row.get::<_, Option<String>>(0),
  ).ok().flatten();
  conn.execute(
    "INSERT INTO game_covers (title_key,cover_url,updated_at) \
     VALUES (?1,?2,CURRENT_TIMESTAMP) ON CONFLICT(title_key) DO UPDATE SET \
     cover_url=excluded.cover_url,\
     local_path=CASE WHEN game_covers.cover_url!=excluded.cover_url THEN NULL \
     ELSE game_covers.local_path END,updated_at=CURRENT_TIMESTAMP",
    params![key, url],
  ).map_err(|error| format!("could_not_upsert_game_cover: {error}"))?;
  Ok(stale)
}

pub fn upsert_game_cover_if_absent(
  conn: &Connection,
  title: &str,
  cover_url: &str,
) -> Result<Option<String>, String> {
  if super::lookup_cover_row_for_title(conn, title).is_some() {
    Ok(None)
  } else {
    upsert_game_cover(conn, title, cover_url)
  }
}

pub fn should_skip_cover_resolve(conn: &Connection, title_key: &str) -> bool {
  let now = super::precache::now_unix_secs();
  conn.query_row(
    "SELECT tried_at FROM cover_precache_skip WHERE title_key=?1",
    params![title_key],
    |row| row.get::<_, i64>(0),
  ).ok().is_some_and(|tried_at| now - tried_at < 7 * 86400)
}

pub fn mark_cover_resolve_skip(conn: &Connection, title_key: &str) {
  let _ = conn.execute(
    "INSERT INTO cover_precache_skip (title_key,tried_at) VALUES (?1,?2) \
     ON CONFLICT(title_key) DO UPDATE SET tried_at=excluded.tried_at",
    params![title_key, super::precache::now_unix_secs()],
  );
}

pub fn clear_cover_precache_skips(conn: &Connection) -> Result<usize, String> {
  conn.execute("DELETE FROM cover_precache_skip", [])
    .map_err(|error| format!("could_not_clear_cover_skips: {error}"))
}

pub fn count_active_cover_skips(conn: &Connection) -> Result<usize, String> {
  conn.query_row(
    "SELECT COUNT(*) FROM cover_precache_skip WHERE tried_at>?1",
    params![super::precache::now_unix_secs() - 7 * 86400],
    |row| row.get(0),
  ).map_err(|error| format!("could_not_count_cover_skips: {error}"))
}
