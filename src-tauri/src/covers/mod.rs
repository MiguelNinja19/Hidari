mod precache;
mod steam_index;

pub use precache::{
  attach_cover_urls_to_games, bulk_resolve_catalog_covers_from_index, get_cover_cache_stats,
  get_cover_precache_status, resolve_cover_url, resolve_covers_for_titles, retry_unresolved_covers,
  start_cover_precache, stop_cover_precache, CoverPrecacheState,
};
pub use steam_index::{
  get_steam_app_index_status, lookup_steam_app_id_local, maybe_refresh_steam_app_index,
  refresh_steam_app_index,
};

use crate::db::open_database_connection;
use crate::dto::GameCoverDto;
use crate::title;
use crate::config;
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tokio::time::{sleep, Duration};

pub(crate) fn covers_dir_for_app(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("could_not_resolve_app_data_dir: {e}"))?
    .join("covers");
  fs::create_dir_all(&dir).map_err(|e| format!("could_not_create_covers_dir: {e}"))?;
  Ok(dir)
}

pub fn is_valid_cover_bytes(bytes: &[u8]) -> bool {
  if bytes.len() < 256 {
    return false;
  }
  if bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
    return true;
  }
  if bytes.len() >= 8 && bytes[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
    return true;
  }
  if bytes.len() >= 12 && bytes[0..4] == *b"RIFF" && bytes[8..12] == *b"WEBP" {
    return true;
  }
  if bytes.len() >= 6 && (bytes[0..6] == *b"GIF87a" || bytes[0..6] == *b"GIF89a") {
    return true;
  }
  false
}

pub fn is_plausible_cover_url(url: &str) -> bool {
  let trimmed = url.trim();
  trimmed.len() >= 12
    && (trimmed.starts_with("http://") || trimmed.starts_with("https://"))
}

pub fn is_plausible_local_cover_path(path: &str, covers_dir: &Path) -> bool {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return false;
  }
  if trimmed.contains("://")
    || trimmed.contains(".jpg:")
    || trimmed.contains(".jpeg:")
    || trimmed.contains(".png:")
    || trimmed.contains(".webp:")
  {
    return false;
  }
  let path_obj = Path::new(trimmed);
  if path_obj.is_relative() {
    return false;
  }
  if trimmed.starts_with("\\\\") {
    let covers_leaf = covers_dir
      .file_name()
      .and_then(|name| name.to_str())
      .unwrap_or("covers")
      .to_ascii_lowercase();
    let lower = trimmed.to_ascii_lowercase();
    if !lower.contains(&format!("\\{covers_leaf}\\")) {
      return false;
    }
  }
  true
}

pub fn is_usable_cover_file(path: &Path, covers_dir: &Path) -> bool {
  let path_str = path.to_string_lossy();
  if !is_plausible_local_cover_path(&path_str, covers_dir) {
    return false;
  }
  if !path.is_file() {
    return false;
  }
  let Ok(meta) = fs::metadata(path) else {
    return false;
  };
  if meta.len() < 256 {
    return false;
  }
  let Ok(canon_file) = path.canonicalize() else {
    return false;
  };
  let Ok(canon_dir) = covers_dir.canonicalize() else {
    return false;
  };
  if !canon_file.starts_with(&canon_dir) {
    return false;
  }
  let Ok(bytes) = fs::read(path) else {
    return false;
  };
  is_valid_cover_bytes(&bytes)
}

pub fn repair_corrupt_cover_paths(conn: &Connection, covers_dir: &Path) -> Result<usize, String> {
  let mut stmt = conn
    .prepare("SELECT title_key, local_path FROM game_covers WHERE local_path IS NOT NULL")
    .map_err(|e| format!("could_not_prepare_cover_repair: {e}"))?;
  let rows = stmt
    .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
    .map_err(|e| format!("could_not_query_cover_repair: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_cover_repair: {e}"))?;

  let mut repaired = 0usize;
  for (title_key, local_path) in rows {
    let plausible = is_plausible_local_cover_path(&local_path, covers_dir);
    let usable = plausible && is_usable_cover_file(Path::new(&local_path), covers_dir);
    if usable {
      continue;
    }
    conn
      .execute(
        "UPDATE game_covers SET local_path = NULL WHERE title_key = ?1",
        params![title_key],
      )
      .map_err(|e| format!("could_not_clear_corrupt_cover_path: {e}"))?;
    if is_plausible_local_cover_path(&local_path, covers_dir) {
      remove_cover_file(&local_path);
    }
    repaired += 1;
  }
  Ok(repaired)
}

/// Remove entradas com `cover_url` inválida (ex.: "https" gravado por bug no script Python).
pub fn repair_corrupt_cover_urls(conn: &Connection) -> Result<usize, String> {
  let mut stmt = conn
    .prepare("SELECT title_key, cover_url FROM game_covers")
    .map_err(|e| format!("could_not_prepare_cover_url_repair: {e}"))?;
  let rows = stmt
    .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
    .map_err(|e| format!("could_not_query_cover_url_repair: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_cover_url_repair: {e}"))?;

  let mut repaired = 0usize;
  for (title_key, cover_url) in rows {
    if is_plausible_cover_url(&cover_url) {
      continue;
    }
    conn
      .execute("DELETE FROM game_covers WHERE title_key = ?1", params![title_key])
      .map_err(|e| format!("could_not_delete_corrupt_cover_url: {e}"))?;
    repaired += 1;
  }
  Ok(repaired)
}

pub fn cover_download_urls(cover_url: &str) -> Vec<String> {
  let trimmed = cover_url.trim();
  let mut urls = Vec::new();
  if let Some(rest) = trimmed.split("/steam/apps/").nth(1) {
    if let Some(app_id) = rest.split('/').next().filter(|id| !id.is_empty()) {
      urls.extend(config::steam_library_cover_urls(app_id));
    }
  }
  urls.push(trimmed.to_string());
  let mut seen = HashSet::new();
  urls.retain(|url| seen.insert(url.clone()));
  urls
}

pub async fn fetch_cover_bytes(client: &reqwest::Client, cover_url: &str) -> Option<Vec<u8>> {
  for attempt in 0..2 {
    match client.get(cover_url).send().await {
      Ok(response) if response.status().is_success() => {
        if let Ok(bytes) = response.bytes().await {
          if is_valid_cover_bytes(&bytes) {
            return Some(bytes.to_vec());
          }
        }
      }
      Ok(response)
        if !response.status().is_server_error() && response.status().as_u16() != 429 =>
      {
        break;
      }
      Ok(_) | Err(_) => {}
    }
    if attempt + 1 < 2 {
      sleep(Duration::from_millis(350 * (attempt as u64 + 1))).await;
    }
  }
  None
}

pub fn remove_cover_file(path: &str) {
  let _ = fs::remove_file(path);
}

/// Insere ou atualiza a URL da capa. Se a URL mudar, devolve o `local_path` antigo para apagar o ficheiro.
pub fn upsert_game_cover(
  conn: &Connection,
  title: &str,
  cover_url: &str,
) -> Result<Option<String>, String> {
  let title_key = title::normalize_title_key(title);
  if title_key.is_empty() || !is_plausible_cover_url(cover_url) {
    return Ok(None);
  }
  let trimmed = cover_url.trim();

  let stale_local: Option<String> = conn
    .query_row(
      "SELECT local_path FROM game_covers WHERE title_key = ?1 AND cover_url != ?2",
      params![title_key, trimmed],
      |row| row.get(0),
    )
    .ok()
    .flatten();

  conn
    .execute(
      "INSERT INTO game_covers (title_key, cover_url, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP) \
       ON CONFLICT(title_key) DO UPDATE SET \
         cover_url = excluded.cover_url, \
         local_path = CASE WHEN game_covers.cover_url != excluded.cover_url THEN NULL ELSE game_covers.local_path END, \
         updated_at = CURRENT_TIMESTAMP",
      params![title_key, trimmed],
    )
    .map_err(|e| format!("could_not_upsert_game_cover: {e}"))?;
  Ok(stale_local)
}

const COVER_SKIP_RETRY_SECS: i64 = 7 * 86400;

pub fn lookup_cover_row(conn: &Connection, title_key: &str) -> Option<(String, Option<String>)> {
  let row: Option<(String, Option<String>)> = conn
    .query_row(
      "SELECT cover_url, local_path FROM game_covers WHERE title_key = ?1",
      params![title_key],
      |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
    )
    .ok();
  row.and_then(|(url, local)| {
    if is_plausible_cover_url(&url) {
      Some((url, local))
    } else {
      None
    }
  })
}

/// Procura capa pelo título bruto ou pelo nome base do jogo (repack/versão no título).
pub fn lookup_cover_row_for_title(conn: &Connection, title: &str) -> Option<(String, Option<String>)> {
  let trimmed = title.trim();
  if trimmed.is_empty() {
    return None;
  }
  let key = title::normalize_title_key(trimmed);
  if let Some(row) = lookup_cover_row(conn, &key) {
    return Some(row);
  }
  let group = title::catalog_game_group_key(trimmed);
  if group != key {
    lookup_cover_row(conn, &group)
  } else {
    None
  }
}

pub fn should_skip_cover_resolve(conn: &Connection, title_key: &str) -> bool {
  let now = precache::now_unix_secs();
  conn
    .query_row(
      "SELECT tried_at FROM cover_precache_skip WHERE title_key = ?1",
      params![title_key],
      |row| row.get::<_, i64>(0),
    )
    .ok()
    .is_some_and(|tried_at| now - tried_at < COVER_SKIP_RETRY_SECS)
}

pub fn mark_cover_resolve_skip(conn: &Connection, title_key: &str) {
  let now = precache::now_unix_secs();
  let _ = conn.execute(
    "INSERT INTO cover_precache_skip (title_key, tried_at) VALUES (?1, ?2) \
     ON CONFLICT(title_key) DO UPDATE SET tried_at = excluded.tried_at",
    params![title_key, now],
  );
}

pub fn clear_cover_precache_skips(conn: &Connection) -> Result<usize, String> {
  let removed = conn
    .execute("DELETE FROM cover_precache_skip", [])
    .map_err(|e| format!("could_not_clear_cover_skips: {e}"))?;
  Ok(removed)
}

pub fn count_active_cover_skips(conn: &Connection) -> Result<usize, String> {
  let now = precache::now_unix_secs();
  conn
    .query_row(
      "SELECT COUNT(*) FROM cover_precache_skip WHERE tried_at > ?1",
      params![now - COVER_SKIP_RETRY_SECS],
      |row| row.get(0),
    )
    .map_err(|e| format!("could_not_count_cover_skips: {e}"))
}

pub async fn download_and_cache_cover(
  app: &AppHandle,
  title: &str,
  cover_url: &str,
) -> Result<Option<String>, String> {
  let title_key = title::normalize_title_key(title);
  if title_key.is_empty() {
    return Ok(None);
  }

  let covers_dir = covers_dir_for_app(app)?;

  let mut hasher = DefaultHasher::new();
  title_key.hash(&mut hasher);
  cover_url.hash(&mut hasher);
  let file_name = format!("{:x}.jpg", hasher.finish());
  let file_path = covers_dir.join(file_name);

  if file_path.exists() && !is_usable_cover_file(&file_path, &covers_dir) {
    remove_cover_file(&file_path.to_string_lossy());
  }

  if is_usable_cover_file(&file_path, &covers_dir) {
    let local_path = file_path.to_string_lossy().to_string();
    let conn = open_database_connection(app)?;
    conn
      .execute(
        "UPDATE game_covers SET local_path = ?1, updated_at = CURRENT_TIMESTAMP WHERE title_key = ?2",
        params![local_path, title_key],
      )
      .map_err(|e| format!("could_not_update_cover_local_path: {e}"))?;
    return Ok(Some(local_path));
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(20))
    .user_agent("MyLauncher/1.0")
    .build()
    .map_err(|e| format!("could_not_create_http_client: {e}"))?;

  let mut downloaded: Option<Vec<u8>> = None;
  for candidate_url in cover_download_urls(cover_url) {
    if let Some(bytes) = fetch_cover_bytes(&client, &candidate_url).await {
      downloaded = Some(bytes);
      break;
    }
  }

  let Some(bytes) = downloaded else {
    eprintln!("cover_cache_miss: all candidates failed for {title_key}");
    return Ok(None);
  };
  fs::write(&file_path, &bytes).map_err(|e| format!("could_not_write_cover_cache: {e}"))?;

  let local_path = file_path.to_string_lossy().to_string();
  let conn = open_database_connection(app)?;
  conn
    .execute(
      "UPDATE game_covers SET local_path = ?1, updated_at = CURRENT_TIMESTAMP WHERE title_key = ?2",
      params![local_path, title_key],
    )
    .map_err(|e| format!("could_not_update_cover_local_path: {e}"))?;
  Ok(Some(local_path))
}

#[tauri::command]
pub fn list_game_covers(app: AppHandle) -> Result<Vec<GameCoverDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare("SELECT title_key, cover_url, local_path FROM game_covers ORDER BY updated_at DESC")
    .map_err(|e| format!("could_not_prepare_list_game_covers: {e}"))?;
  let rows = stmt
    .query_map([], |row| {
      Ok(GameCoverDto {
        title_key: row.get(0)?,
        cover_url: row.get(1)?,
        local_path: row.get(2)?,
      })
    })
    .map_err(|e| format!("could_not_query_game_covers: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_game_covers: {e}"))?;
  Ok(rows)
}

#[tauri::command]
pub async fn ensure_game_cover_cached(app: AppHandle, title: String) -> Result<Option<String>, String> {
  let conn = open_database_connection(&app)?;
  let title_key = title::normalize_title_key(&title);
  let (cover_url, local_path): (String, Option<String>) = match conn.query_row(
    "SELECT cover_url, local_path FROM game_covers WHERE title_key = ?1",
    params![title_key],
    |row| Ok((row.get(0)?, row.get(1)?)),
  ) {
    Ok(row) => row,
    Err(_) => return Ok(None),
  };
  drop(conn);

  let covers_dir = covers_dir_for_app(&app)?;
  if let Some(path) = local_path {
    if is_usable_cover_file(Path::new(&path), &covers_dir) {
      return Ok(Some(path));
    }
    remove_cover_file(&path);
    let conn = open_database_connection(&app)?;
    conn
      .execute(
        "UPDATE game_covers SET local_path = NULL WHERE title_key = ?1",
        params![title_key],
      )
      .map_err(|e| format!("could_not_clear_cover_local_path: {e}"))?;
  }
  download_and_cache_cover(&app, &title, &cover_url).await
}

#[tauri::command]
pub fn invalidate_game_cover_local(app: AppHandle, title: String) -> Result<(), String> {
  let title_key = title::normalize_title_key(&title);
  if title_key.is_empty() {
    return Ok(());
  }
  let conn = open_database_connection(&app)?;
  let local_path: Option<String> = conn
    .query_row(
      "SELECT local_path FROM game_covers WHERE title_key = ?1",
      params![title_key],
      |row| row.get(0),
    )
    .unwrap_or(None);
  conn
    .execute(
      "UPDATE game_covers SET local_path = NULL WHERE title_key = ?1",
      params![title_key],
    )
    .map_err(|e| format!("could_not_clear_cover_local_path: {e}"))?;
  if let Some(path) = local_path {
    remove_cover_file(&path);
  }
  Ok(())
}

#[tauri::command]
pub async fn save_game_cover(app: AppHandle, title: String, cover_url: String) -> Result<(), String> {
  let trimmed = cover_url.trim().to_string();
  if trimmed.is_empty() {
    return Ok(());
  }

  let stale = {
    let conn = open_database_connection(&app)?;
    upsert_game_cover(&conn, &title, &trimmed)?
  };
  if let Some(path) = stale {
    remove_cover_file(&path);
  }

  let covers_dir = covers_dir_for_app(&app)?;
  let needs_download = {
    let conn = open_database_connection(&app)?;
    let title_key = title::normalize_title_key(&title);
    let local_path: Option<String> = conn
      .query_row(
        "SELECT local_path FROM game_covers WHERE title_key = ?1",
        params![title_key],
        |row| row.get(0),
      )
      .unwrap_or(None);
    !local_path
      .as_deref()
      .is_some_and(|path| is_usable_cover_file(Path::new(path), &covers_dir))
  };

  if needs_download {
    let app_bg = app.clone();
    let title_bg = title.clone();
    tauri::async_runtime::spawn(async move {
      let _ = download_and_cache_cover(&app_bg, &title_bg, &trimmed).await;
    });
  }

  Ok(())
}

#[tauri::command]
pub async fn resolve_game_cover_url(app: AppHandle, title: String) -> Result<Option<String>, String> {
  Ok(resolve_cover_url(&app, &title).await)
}

#[cfg(test)]
mod cover_cache_tests {
  use crate::covers::{cover_download_urls, is_valid_cover_bytes, upsert_game_cover};
  use crate::title;
  use rusqlite::{params, Connection};

  fn test_conn() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        "CREATE TABLE game_covers (
          title_key TEXT PRIMARY KEY,
          cover_url TEXT NOT NULL,
          local_path TEXT,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );",
      )
      .unwrap();
    conn
  }

  #[test]
  fn upsert_invalidates_local_path_when_cover_url_changes() {
    let conn = test_conn();
    let title = "Example Game Collection";
    let key = title::normalize_title_key(title);

    conn.execute(
      "INSERT INTO game_covers (title_key, cover_url, local_path) VALUES (?1, ?2, ?3)",
      params![key, "https://example.com/old.jpg", "C:\\covers\\old.jpg"],
    )
    .unwrap();

    let stale = upsert_game_cover(&conn, title, "https://example.com/new.jpg").unwrap();
    assert_eq!(stale.as_deref(), Some("C:\\covers\\old.jpg"));

    let (url, local): (String, Option<String>) = conn
      .query_row(
        "SELECT cover_url, local_path FROM game_covers WHERE title_key = ?1",
        params![key],
        |row| Ok((row.get(0)?, row.get(1)?)),
      )
      .unwrap();
    assert_eq!(url, "https://example.com/new.jpg");
    assert!(local.is_none());
  }

  #[test]
  fn upsert_keeps_local_path_when_cover_url_unchanged() {
    let conn = test_conn();
    let title = "Sample Harvest Game";
    let key = title::normalize_title_key(title);
    let url = "https://cdn.example.com/sample.jpg";

    conn.execute(
      "INSERT INTO game_covers (title_key, cover_url, local_path) VALUES (?1, ?2, ?3)",
      params![key, url, "C:\\covers\\sample.jpg"],
    )
    .unwrap();

    let stale = upsert_game_cover(&conn, title, url).unwrap();
    assert!(stale.is_none());

    let local: Option<String> = conn
      .query_row(
        "SELECT local_path FROM game_covers WHERE title_key = ?1",
        params![key],
        |row| row.get(0),
      )
      .unwrap();
    assert_eq!(local.as_deref(), Some("C:\\covers\\sample.jpg"));
  }

  #[test]
  fn rejects_html_and_tiny_payloads_as_covers() {
    assert!(!is_valid_cover_bytes(b"<html>404 not found</html>"));
    assert!(!is_valid_cover_bytes(&[0xFF; 128]));
  }

  #[test]
  fn accepts_jpeg_png_and_webp_magic_bytes() {
    let mut jpeg = vec![0xFF, 0xD8, 0xFF, 0xE0];
    jpeg.resize(300, 0);
    assert!(is_valid_cover_bytes(&jpeg));

    let mut png = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    png.resize(300, 0);
    assert!(is_valid_cover_bytes(&png));

    let mut webp = b"RIFF".to_vec();
    webp.extend_from_slice(&[0, 0, 0, 0]);
    webp.extend_from_slice(b"WEBP");
    webp.resize(300, 0);
    assert!(is_valid_cover_bytes(&webp));
  }

  #[test]
  fn cover_download_urls_includes_steam_variants() {
    let urls = cover_download_urls(
      "https://cdn.cloudflare.steamstatic.com/steam/apps/570/header.jpg",
    );
    assert!(urls.iter().any(|u| u.contains("library_600x900.jpg")));
    assert!(urls.iter().any(|u| u.contains("header.jpg")));
    assert!(urls.len() >= 3);
  }
}
