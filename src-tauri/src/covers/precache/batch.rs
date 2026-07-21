use crate::db::open_database_connection;
use crate::dto::ResolvedCoverBatchItem;
use std::collections::HashSet;
use std::path::Path;
use tauri::AppHandle;

async fn resolve_item(app: &AppHandle, title: String) -> ResolvedCoverBatchItem {
  let title = title.trim().to_string();
  let Ok(dir) = super::super::covers_dir_for_app(app) else {
    return ResolvedCoverBatchItem {
      title, cover_url: None, local_cover_path: None,
    };
  };
  if let Ok(conn) = open_database_connection(app) {
    if let Some((url, local)) = super::super::lookup_cover_row_for_title(&conn, &title) {
      return ResolvedCoverBatchItem {
        title,
        cover_url: Some(url),
        local_cover_path: local.filter(|path| {
          super::super::is_usable_cover_file(Path::new(path), &dir)
        }),
      };
    }
    if let Some(url) = super::resolve_cover_url_local(&conn, &title) {
      let _ = super::super::upsert_game_cover_if_absent(&conn, &title, &url);
      return ResolvedCoverBatchItem {
        title,
        cover_url: Some(url),
        local_cover_path: None,
      };
    }
  }
  let cover_url = super::resolve_cover_url(app, &title).await;
  let local_cover_path = open_database_connection(app)
    .ok()
    .and_then(|conn| super::super::lookup_cover_row_for_title(&conn, &title))
    .and_then(|(_, path)| path)
    .filter(|path| super::super::is_usable_cover_file(Path::new(path), &dir));
  ResolvedCoverBatchItem { title, cover_url, local_cover_path }
}

#[tauri::command]
pub async fn resolve_covers_for_titles(
  app: AppHandle,
  titles: Vec<String>,
) -> Result<Vec<ResolvedCoverBatchItem>, String> {
  let unique = titles
    .into_iter()
    .map(|title| title.trim().to_string())
    .filter(|title| title.len() >= 2)
    .collect::<HashSet<_>>()
    .into_iter()
    .take(200)
    .collect::<Vec<_>>();
  let mut output = Vec::with_capacity(unique.len());
  let mut tasks = tokio::task::JoinSet::new();
  for title in unique {
    while tasks.len() >= 3 {
      if let Some(Ok(item)) = tasks.join_next().await {
        output.push(item);
      }
    }
    let app = app.clone();
    tasks.spawn(async move { resolve_item(&app, title).await });
  }
  while let Some(result) = tasks.join_next().await {
    if let Ok(item) = result {
      output.push(item);
    }
  }
  Ok(output)
}
