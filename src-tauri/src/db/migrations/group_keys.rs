use rusqlite::{params, Connection};

use super::super::settings::read_app_setting;

pub(crate) fn migrate_catalog_group_keys(conn: &Connection) -> Result<(), String> {
  migrate_catalog_group_keys_version(conn, "catalog_group_keys_v2")?;
  migrate_catalog_group_keys_version(conn, "catalog_group_keys_v3")?;
  migrate_catalog_group_keys_version(conn, "catalog_group_keys_v4")
}

fn migrate_catalog_group_keys_version(conn: &Connection, key: &str) -> Result<(), String> {
  let _ = conn.execute(
    "ALTER TABLE hydra_catalog_entries ADD COLUMN group_key TEXT NOT NULL DEFAULT ''",
    [],
  );
  let _ = conn.execute(
    "ALTER TABLE hydra_catalog_entries ADD COLUMN display_title TEXT NOT NULL DEFAULT ''",
    [],
  );
  let _ = conn.execute(
    "CREATE INDEX IF NOT EXISTS idx_hce_source_group ON hydra_catalog_entries(source_id, group_key)",
    [],
  );

  if read_app_setting(conn, key).is_some() {
    return Ok(());
  }

  let mut update = conn
    .prepare(
      "UPDATE hydra_catalog_entries SET group_key = ?1, display_title = ?2 WHERE id = ?3",
    )
    .map_err(|e| format!("migrate_group_keys_prepare: {e}"))?;

  let mut last_id: i64 = 0;
  loop {
    let mut stmt = conn
      .prepare(
        "SELECT id, title FROM hydra_catalog_entries \
         WHERE id > ?1 ORDER BY id ASC LIMIT 2000",
      )
      .map_err(|e| format!("migrate_group_keys_select: {e}"))?;
    let rows: Vec<(i64, String)> = stmt
      .query_map(params![last_id], |row| Ok((row.get(0)?, row.get(1)?)))
      .map_err(|e| format!("migrate_group_keys_query: {e}"))?
      .filter_map(Result::ok)
      .collect();
    if rows.is_empty() {
      break;
    }
    for (id, title) in rows {
      last_id = id;
      let group_key = crate::title::catalog_game_group_key(&title);
      let display_title = crate::title::clean_title_for_matching(&title);
      update
        .execute(params![group_key, display_title, id])
        .map_err(|e| format!("migrate_group_keys_update: {e}"))?;
    }
  }

  let _ = conn.execute(
    "DELETE FROM app_settings WHERE key = 'catalog_group_keys_v1'",
    [],
  );
  conn
    .execute(
      "INSERT INTO app_settings (key, value) VALUES (?1, '1')",
      params![key],
    )
    .map_err(|e| format!("migrate_group_keys_mark: {e}"))?;
  Ok(())
}
