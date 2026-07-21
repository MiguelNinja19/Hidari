use crate::covers::{download_and_cache_cover, remove_cover_file, upsert_game_cover};
use crate::db::open_database_connection;
use crate::dto::SidecarEnqueuePayload;
use tauri::AppHandle;

pub(crate) fn spawn_cover_download_if_needed(app: &AppHandle, payload: &SidecarEnqueuePayload) {
  let Some(cover_url) = payload
    .cover_url
    .as_ref()
    .map(|value| value.trim())
    .filter(|value| !value.is_empty())
  else {
    return;
  };

  if let Ok(conn) = open_database_connection(app) {
    if let Ok(Some(path)) = upsert_game_cover(&conn, &payload.title, cover_url) {
      remove_cover_file(&path);
    }
  }
  let app_bg = app.clone();
  let title_bg = payload.title.clone();
  let cover_bg = cover_url.to_string();
  tauri::async_runtime::spawn(async move {
    let _ = download_and_cache_cover(&app_bg, &title_bg, &cover_bg).await;
  });
}
