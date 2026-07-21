use crate::db::open_database_connection;
use rusqlite::Connection;
use std::collections::HashMap;
use std::path::Path;
use tauri::AppHandle;

#[derive(Clone)]
pub(crate) struct CoverBatchRow {
  pub(crate) url: String,
  pub(crate) local_path: Option<String>,
}

pub(crate) fn batch_lookup_cover_rows(
  conn: &Connection,
  keys: &[String],
  covers_dir: &Path,
) -> HashMap<String, CoverBatchRow> {
  let mut output = HashMap::new();
  for chunk in keys.chunks(120) {
    let placeholders = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let Ok(mut stmt) = conn.prepare(&format!(
      "SELECT title_key,cover_url,local_path FROM game_covers WHERE title_key IN ({placeholders})"
    )) else { continue };
    let params = chunk.iter().map(|key| key as &dyn rusqlite::ToSql).collect::<Vec<_>>();
    let Ok(rows) = stmt.query_map(params.as_slice(), |row| Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, Option<String>>(2)?,
    ))) else { continue };
    for (key, url, local) in rows.flatten() {
      if !super::super::is_plausible_cover_url(&url) {
        continue;
      }
      let local_path = local.filter(|path| {
        super::super::is_usable_cover_file(Path::new(path), covers_dir)
      });
      output.insert(key, CoverBatchRow { url, local_path });
    }
  }
  output
}

pub fn attach_cover_urls_to_games(
  app: &AppHandle,
  games: &mut [crate::dto::CatalogGameDto],
) {
  let (Ok(conn), Ok(dir)) = (
    open_database_connection(app),
    super::super::covers_dir_for_app(app),
  ) else { return };
  let keys = games.iter()
    .map(|game| crate::title::normalize_title_key(&game.title))
    .filter(|key| !key.is_empty())
    .collect::<Vec<_>>();
  let stored = batch_lookup_cover_rows(&conn, &keys, &dir);
  for game in games {
    let key = crate::title::normalize_title_key(&game.title);
    if let Some(row) = stored.get(&key) {
      if game.cover_url.as_ref().is_none_or(|url| url.trim().is_empty()) {
        game.cover_url = Some(row.url.clone());
      }
      if row.local_path.is_some() {
        game.local_cover_path = row.local_path.clone();
      }
    } else if game.cover_url.as_ref().is_none_or(|url| url.trim().is_empty()) {
      game.cover_url = crate::catalog::embedded_cover_for_title(&game.title)
        .or_else(|| super::super::steam_index::resolve_cover_via_local_index_exact(
          &conn, &game.title,
        ));
    }
  }
}
