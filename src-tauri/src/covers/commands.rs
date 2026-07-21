use crate::db::open_database_connection;
use crate::dto::GameCoverDto;
use rusqlite::params;
use std::path::Path;
use tauri::AppHandle;

#[tauri::command]
pub async fn list_game_covers(app: AppHandle) -> Result<Vec<GameCoverDto>, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let conn = open_database_connection(&app)?;
    let mut stmt = conn.prepare(
      "SELECT title_key,cover_url,local_path FROM game_covers ORDER BY updated_at DESC",
    ).map_err(|error| format!("could_not_prepare_list_game_covers: {error}"))?;
    let result = stmt.query_map([], |row| Ok(GameCoverDto {
      title_key: row.get(0)?,
      cover_url: row.get(1)?,
      local_path: row.get(2)?,
    }))
    .map_err(|error| format!("could_not_query_game_covers: {error}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| format!("could_not_map_game_covers: {error}"));
    result
  }).await.map_err(|error| format!("list_game_covers_join_error: {error}"))?
}

#[tauri::command]
pub async fn ensure_game_cover_cached(
  app: AppHandle,
  title: String,
) -> Result<Option<String>, String> {
  let conn = open_database_connection(&app)?;
  let Some((url, local)) = super::lookup_cover_row_for_title(&conn, &title) else {
    return Ok(None);
  };
  drop(conn);
  let dir = super::covers_dir_for_app(&app)?;
  if local.as_deref().is_some_and(|path| super::is_usable_cover_file(Path::new(path), &dir)) {
    return Ok(local);
  }
  super::download_and_cache_cover(&app, &title, &url).await
}

#[tauri::command]
pub fn invalidate_game_cover_local(app: AppHandle, title: String) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  let local = super::lookup_cover_row_for_title(&conn, &title).and_then(|(_, path)| path);
  for key in crate::title::cover_title_key_candidates(&title) {
    conn.execute("UPDATE game_covers SET local_path=NULL WHERE title_key=?1", params![key])
      .map_err(|error| format!("could_not_clear_cover_local_path: {error}"))?;
  }
  if let Some(path) = local {
    super::remove_cover_file(&path);
  }
  Ok(())
}

#[tauri::command]
pub async fn save_game_cover(
  app: AppHandle,
  title: String,
  cover_url: String,
) -> Result<(), String> {
  if cover_url.trim().is_empty() {
    return Ok(());
  }
  let conn = open_database_connection(&app)?;
  let stale = super::upsert_game_cover(&conn, &title, &cover_url)?;
  drop(conn);
  if let Some(path) = stale {
    super::remove_cover_file(&path);
  }
  let app_bg = app.clone();
  tauri::async_runtime::spawn(async move {
    let _ = super::download_and_cache_cover(&app_bg, &title, cover_url.trim()).await;
  });
  Ok(())
}

#[tauri::command]
pub async fn resolve_game_cover_url(
  app: AppHandle,
  title: String,
) -> Result<Option<String>, String> {
  Ok(super::resolve_cover_url(&app, &title).await)
}
