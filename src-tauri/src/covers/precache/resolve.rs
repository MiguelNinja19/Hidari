use crate::catalog::{embedded_cover_for_title, fetch_steam_cover_url_for_title};
use crate::db::open_database_connection;
use rusqlite::Connection;
use tauri::AppHandle;

pub async fn resolve_cover_url(app: &AppHandle, title: &str) -> Option<String> {
  let title = title.trim();
  if title.is_empty() {
    return None;
  }
  let key = crate::title::normalize_title_key(title);
  let mut index_url = None;
  if let Ok(conn) = open_database_connection(app) {
    if let Some((url, _)) = super::super::lookup_cover_row_for_title(&conn, title) {
      return Some(url);
    }
    if super::super::should_skip_cover_resolve(&conn, &key) {
      return None;
    }
    index_url = super::super::steam_index::resolve_cover_via_local_index(&conn, title);
  }
  let resolved = if let Some(url) = embedded_cover_for_title(title) {
    Some(url)
  } else if index_url.is_some() {
    index_url
  } else {
    fetch_steam_cover_url_for_title(title).await
  };
  if let Ok(conn) = open_database_connection(app) {
    if let Some(url) = &resolved {
      let _ = super::super::upsert_game_cover_if_absent(&conn, title, url);
    } else {
      super::super::mark_cover_resolve_skip(&conn, &key);
    }
  }
  resolved
}

pub fn resolve_cover_url_local(conn: &Connection, title: &str) -> Option<String> {
  let title = title.trim();
  if title.is_empty() {
    return None;
  }
  embedded_cover_for_title(title)
    .or_else(|| super::super::steam_index::resolve_cover_via_local_index(conn, title))
}

pub fn bulk_resolve_catalog_covers_from_index(app: &AppHandle) -> Result<usize, String> {
  let conn = open_database_connection(app)?;
  if super::super::steam_index::steam_app_index_count(&conn) == 0 {
    return Ok(0);
  }
  let mut stmt = conn
    .prepare("SELECT DISTINCT title FROM hydra_catalog_entries")
    .map_err(|error| format!("bulk_resolve_prepare: {error}"))?;
  let titles = stmt
    .query_map([], |row| row.get::<_, String>(0))
    .map_err(|error| format!("bulk_resolve_query: {error}"))?
    .filter_map(Result::ok)
    .collect::<Vec<_>>();
  let mut count = 0;
  for title in titles {
    if super::super::lookup_cover_row_for_title(&conn, &title).is_some() {
      continue;
    }
    if let Some(url) = resolve_cover_url_local(&conn, &title) {
      super::super::upsert_game_cover_if_absent(&conn, &title, &url)?;
      count += 1;
    }
  }
  Ok(count)
}
