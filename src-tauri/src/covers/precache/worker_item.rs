use crate::db::open_database_connection;
use std::path::Path;
use tauri::AppHandle;

pub(crate) enum Outcome {
  Cached,
  Downloaded,
  Unresolved,
  Failed,
}

pub(crate) async fn process_title(
  app: &AppHandle,
  title: &str,
  covers_dir: &Path,
) -> Outcome {
  if let Ok(conn) = open_database_connection(app) {
    if let Some((url, local)) = super::super::lookup_cover_row_for_title(&conn, title) {
      if local.as_deref().is_some_and(|path| {
        super::super::is_usable_cover_file(Path::new(path), covers_dir)
      }) {
        return Outcome::Cached;
      }
      if !url.trim().is_empty() {
        return match super::super::download_and_cache_cover(app, title, &url).await {
          Ok(Some(_)) => Outcome::Downloaded,
          _ => Outcome::Failed,
        };
      }
    }
  }
  if let Some(url) = super::resolve_cover_url(app, title).await {
    return match super::super::download_and_cache_cover(app, title, &url).await {
      Ok(Some(_)) => Outcome::Downloaded,
      _ => Outcome::Failed,
    };
  }
  if let Ok(conn) = open_database_connection(app) {
    super::super::mark_cover_resolve_skip(
      &conn,
      &crate::title::normalize_title_key(title),
    );
  }
  Outcome::Unresolved
}
