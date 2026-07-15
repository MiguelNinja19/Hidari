use crate::db::open_database_connection;
use crate::dto::{
  FavoriteCatalogEntryDto, LibraryPlayStatDto, ToggleFavoritePayload,
};
use crate::title::normalize_title_key;
use rusqlite::params;
use tauri::AppHandle;

fn catalog_key_for(title: &str, explicit: Option<&str>) -> String {
  explicit
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(str::to_string)
    .unwrap_or_else(|| normalize_title_key(title))
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
    out.push(row.map_err(|e| format!("could_not_read_favorite: {e}"))?);
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
  let exists: bool = conn
    .query_row(
      "SELECT 1 FROM favorite_catalog_entries WHERE catalog_key = ?1",
      params![&key],
      |_| Ok(true),
    )
    .unwrap_or(false);

  if exists {
    conn
      .execute(
        "DELETE FROM favorite_catalog_entries WHERE catalog_key = ?1",
        params![&key],
      )
      .map_err(|e| format!("could_not_remove_favorite: {e}"))?;
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
  Ok(
    conn
      .query_row(
        "SELECT 1 FROM favorite_catalog_entries WHERE catalog_key = ?1",
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
