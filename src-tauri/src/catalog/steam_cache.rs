use crate::dto::CatalogGameDto;
use rusqlite::{params, Connection, OptionalExtension};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn steam_cache_get(conn: &Connection, query_norm: &str) -> Option<Vec<CatalogGameDto>> {
  let now = i64::try_from(
    SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .ok()?
      .as_secs(),
  )
  .ok()?;
  let row = conn
    .query_row(
      "SELECT payload_json, fetched_ts FROM catalog_steam_cache WHERE query_norm = ?1",
      params![query_norm],
      |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
    )
    .optional()
    .ok()??;
  if now - row.1 > 86_400 {
    return None;
  }
  serde_json::from_str(&row.0).ok()
}

pub fn steam_cache_put(
  conn: &Connection,
  query_norm: &str,
  games: &[CatalogGameDto],
) -> Result<(), String> {
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
