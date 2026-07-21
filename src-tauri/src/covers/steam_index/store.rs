use crate::catalog::normalize_match_text;
use rusqlite::{params, Connection};

const UPDATED_AT_KEY: &str = "steam_app_index_updated_at";

pub(crate) fn store_steam_app_index(
  conn: &mut Connection,
  apps: &[(u32, String)],
) -> Result<(), String> {
  let tx = conn.transaction()
    .map_err(|error| format!("steam_app_index_tx_begin: {error}"))?;
  tx.execute("DELETE FROM steam_app_index", [])
    .map_err(|error| format!("steam_app_index_clear: {error}"))?;
  {
    let mut stmt = tx.prepare(
      "INSERT OR REPLACE INTO steam_app_index (app_id,name,name_norm) VALUES (?1,?2,?3)",
    ).map_err(|error| format!("steam_app_index_prepare: {error}"))?;
    for (app_id, name) in apps {
      let normalized = normalize_match_text(name);
      if !normalized.is_empty() {
        stmt.execute(params![app_id, name, normalized])
          .map_err(|error| format!("steam_app_index_insert: {error}"))?;
      }
    }
  }
  tx.commit().map_err(|error| format!("steam_app_index_tx_commit: {error}"))
}

pub(crate) fn set_updated_at(conn: &Connection, timestamp: i64) {
  let _ = conn.execute(
    "INSERT INTO app_settings (key,value) VALUES (?1,?2) \
     ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    params![UPDATED_AT_KEY, timestamp.to_string()],
  );
}

pub fn steam_app_index_last_updated(conn: &Connection) -> Option<i64> {
  crate::db::read_app_setting(conn, UPDATED_AT_KEY)
    .and_then(|value| value.parse().ok())
}

pub fn steam_app_index_count(conn: &Connection) -> usize {
  conn.query_row("SELECT COUNT(*) FROM steam_app_index", [], |row| {
    row.get::<_, i64>(0)
  }).map(|count| count.max(0) as usize).unwrap_or(0)
}

pub fn steam_app_index_is_stale(conn: &Connection) -> bool {
  steam_app_index_count(conn) == 0
    || steam_app_index_last_updated(conn)
      .is_none_or(|updated| super::super::precache::now_unix_secs() - updated > 7 * 86_400)
}
