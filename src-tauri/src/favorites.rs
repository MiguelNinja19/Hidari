use crate::db::open_database_connection;
use crate::dto::{
  FavoriteCatalogEntryDto, LibraryPlayStatDto, ToggleFavoritePayload,
};
use crate::title::{catalog_game_group_key, normalize_title_key};
use rusqlite::params;
use tauri::AppHandle;

fn is_usable_catalog_key(key: &str) -> bool {
  let trimmed = key.trim();
  if trimmed.is_empty() {
    return false;
  }
  let lower = trimmed.to_ascii_lowercase();
  // IDs de UI (`source:emb_…`) / hashes emb_ — não são groupKey de catálogo.
  if lower.starts_with("source:") {
    return false;
  }
  if lower.starts_with("emb_") && !trimmed.contains(' ') {
    return false;
  }
  true
}

fn catalog_key_for(title: &str, explicit: Option<&str>) -> String {
  if let Some(key) = explicit.map(str::trim).filter(|value| is_usable_catalog_key(value)) {
    return key.to_string();
  }
  let from_title = catalog_game_group_key(title);
  if !from_title.is_empty() {
    return from_title;
  }
  normalize_title_key(title)
}

fn repair_favorite_catalog_key(conn: &rusqlite::Connection, entry: &FavoriteCatalogEntryDto) {
  if is_usable_catalog_key(&entry.catalog_key) {
    return;
  }
  let fixed = catalog_key_for(&entry.title, None);
  if fixed.is_empty() || fixed == entry.catalog_key {
    return;
  }
  let already: bool = conn
    .query_row(
      "SELECT 1 FROM favorite_catalog_entries WHERE catalog_key = ?1",
      params![&fixed],
      |_| Ok(true),
    )
    .unwrap_or(false);
  if already {
    let _ = conn.execute(
      "DELETE FROM favorite_catalog_entries WHERE catalog_key = ?1",
      params![&entry.catalog_key],
    );
  } else {
    let _ = conn.execute(
      "UPDATE favorite_catalog_entries SET catalog_key = ?1 WHERE catalog_key = ?2",
      params![&fixed, &entry.catalog_key],
    );
  }
}

fn favorite_exists(conn: &rusqlite::Connection, key: &str, title: &str) -> bool {
  if conn
    .query_row(
      "SELECT 1 FROM favorite_catalog_entries WHERE catalog_key = ?1",
      params![key],
      |_| Ok(true),
    )
    .unwrap_or(false)
  {
    return true;
  }
  // Favoritos antigos gravados com `source:emb_…` — casar pelo título.
  conn
    .query_row(
      "SELECT 1 FROM favorite_catalog_entries \
       WHERE lower(trim(title)) = lower(trim(?1))",
      params![title],
      |_| Ok(true),
    )
    .unwrap_or(false)
}

fn delete_favorite_rows(conn: &rusqlite::Connection, key: &str, title: &str) -> Result<(), String> {
  conn
    .execute(
      "DELETE FROM favorite_catalog_entries \
       WHERE catalog_key = ?1 OR lower(trim(title)) = lower(trim(?2))",
      params![key, title],
    )
    .map_err(|e| format!("could_not_remove_favorite: {e}"))?;
  Ok(())
}

#[tauri::command]
pub fn list_favorite_catalog_entries(app: AppHandle) -> Result<Vec<FavoriteCatalogEntryDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare(
      "SELECT catalog_key, title, added_at FROM favorite_catalog_entries \
       ORDER BY added_at DESC",
    )
    .map_err(|e| format!("could_not_list_favorites: {e}"))?;
  let rows = stmt
    .query_map([], |row| {
      Ok(FavoriteCatalogEntryDto {
        catalog_key: row.get(0)?,
        title: row.get(1)?,
        added_at: row.get(2)?,
      })
    })
    .map_err(|e| format!("could_not_map_favorites: {e}"))?;
  let mut out = Vec::new();
  for row in rows {
    let mut entry = row.map_err(|e| format!("could_not_read_favorite: {e}"))?;
    if !is_usable_catalog_key(&entry.catalog_key) {
      let fixed = catalog_key_for(&entry.title, None);
      repair_favorite_catalog_key(&conn, &entry);
      if !fixed.is_empty() {
        entry.catalog_key = fixed;
      }
    }
    out.push(entry);
  }
  Ok(out)
}

#[tauri::command]
pub fn toggle_favorite_catalog_entry(
  app: AppHandle,
  payload: ToggleFavoritePayload,
) -> Result<bool, String> {
  let title = payload.title.trim();
  if title.is_empty() {
    return Err("favorite_title_empty".to_string());
  }
  let key = catalog_key_for(title, payload.catalog_key.as_deref());
  let conn = open_database_connection(&app)?;

  if favorite_exists(&conn, &key, title) {
    delete_favorite_rows(&conn, &key, title)?;
    return Ok(false);
  }

  conn
    .execute(
      "INSERT INTO favorite_catalog_entries (catalog_key, title, added_at) \
       VALUES (?1, ?2, CURRENT_TIMESTAMP)",
      params![&key, title],
    )
    .map_err(|e| format!("could_not_add_favorite: {e}"))?;
  Ok(true)
}

#[tauri::command]
pub fn is_favorite_catalog_entry(
  app: AppHandle,
  catalog_key: String,
) -> Result<bool, String> {
  let key = catalog_key.trim();
  if key.is_empty() {
    return Ok(false);
  }
  let conn = open_database_connection(&app)?;
  if conn
    .query_row(
      "SELECT 1 FROM favorite_catalog_entries WHERE catalog_key = ?1",
      params![key],
      |_| Ok(true),
    )
    .unwrap_or(false)
  {
    return Ok(true);
  }
  // Chave útil após reparação, ou título passado como fallback.
  let resolved = if is_usable_catalog_key(key) {
    key.to_string()
  } else {
    catalog_key_for(key, None)
  };
  if resolved != key
    && conn
      .query_row(
        "SELECT 1 FROM favorite_catalog_entries WHERE catalog_key = ?1",
        params![&resolved],
        |_| Ok(true),
      )
      .unwrap_or(false)
  {
    return Ok(true);
  }
  Ok(
    conn
      .query_row(
        "SELECT 1 FROM favorite_catalog_entries \
         WHERE lower(trim(title)) = lower(trim(?1)) \
            OR lower(trim(catalog_key)) = lower(trim(?1))",
        params![key],
        |_| Ok(true),
      )
      .unwrap_or(false),
  )
}

#[tauri::command]
pub fn list_library_play_stats(app: AppHandle) -> Result<Vec<LibraryPlayStatDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare(
      "SELECT path_key, last_played_at, play_count FROM library_play_stats \
       ORDER BY datetime(last_played_at) DESC, play_count DESC",
    )
    .map_err(|e| format!("could_not_list_play_stats: {e}"))?;
  let rows = stmt
    .query_map([], |row| {
      Ok(LibraryPlayStatDto {
        path_key: row.get(0)?,
        last_played_at: row.get(1)?,
        play_count: row.get(2)?,
      })
    })
    .map_err(|e| format!("could_not_map_play_stats: {e}"))?;
  let mut out = Vec::new();
  for row in rows {
    out.push(row.map_err(|e| format!("could_not_read_play_stat: {e}"))?);
  }
  Ok(out)
}
