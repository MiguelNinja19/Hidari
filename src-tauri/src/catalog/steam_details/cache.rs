use super::locale::read_app_steam_locale;
use super::types::SteamGameDetails;
use rusqlite::{params, Connection};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const CACHE_TTL: Duration = Duration::from_secs(7 * 24 * 60 * 60);

pub fn read_cached_steam_details(
  conn: &Connection,
  app_id: u32,
  locale: &str,
) -> Option<SteamGameDetails> {
  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .ok()?
    .as_secs() as i64;
  let (json, updated_at): (String, i64) = conn
    .query_row(
      "SELECT payload_json, updated_at FROM steam_game_details WHERE app_id = ?1",
      params![app_id],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .ok()?;
  if now - updated_at > CACHE_TTL.as_secs() as i64 {
    return None;
  }
  let details: SteamGameDetails = serde_json::from_str(&json).ok()?;
  if details.locale != locale {
    return None;
  }
  Some(details)
}

pub fn write_cached_steam_details(conn: &Connection, details: &SteamGameDetails) {
  let Ok(json) = serde_json::to_string(details) else {
    return;
  };
  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs() as i64)
    .unwrap_or(0);
  let _ = conn.execute(
    "INSERT INTO steam_game_details (app_id, payload_json, updated_at) \
     VALUES (?1, ?2, ?3) \
     ON CONFLICT(app_id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at",
    params![details.app_id, json, now],
  );
}

pub fn cached_genres_for_title(conn: &Connection, title: &str) -> Option<Vec<String>> {
  let app_id = crate::covers::lookup_steam_app_id_local(conn, title).map(|(id, _)| id)?;
  let locale = read_app_steam_locale(conn);
  let details = read_cached_steam_details(conn, app_id, &locale)?;
  if details.genres.is_empty() {
    return None;
  }
  Some(details.genres)
}
