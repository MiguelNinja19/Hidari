pub mod roots;
pub mod watcher;

use crate::db::{get_default_download_path, open_database_connection};
use crate::dto::{
  DeleteLocalLibraryItemPayload, InspectLibraryPathsPayload, InspectLibraryPathResultItem,
  LaunchGamePayload, LibraryNotePayload, LibraryPathStateDto, LocalLibraryItemDto,
  SetLibraryGameRootPayload, SetLibraryLaunchExePayload,
};
use crate::launch;
use crate::launch_errors;
use crate::library::roots::{
  clear_library_launch_exe, launch_extra_roots, library_entry_key, read_library_game_root,
  read_library_launch_exe, upsert_library_game_root, upsert_library_launch_exe,
};
use crate::queue::persist::ensure_persisted_queue_table;
use crate::sidecar::{
  emit_extract_status, ensure_sidecar_running, process_job_extraction, process_job_post_download,
};
use crate::state::ExtractionState;
use crate::title::{clean_title_for_matching, normalize_title_key};
use crate::{archive, db};
use rusqlite::params;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;
use std::time::UNIX_EPOCH;
use tokio::time::Duration;

#[tauri::command]
pub fn scan_default_download_path(app: AppHandle) -> Result<Vec<LocalLibraryItemDto>, String> {
  let default_path = get_default_download_path(&app)?;
  let path = match default_path {
    Some(path) if !path.trim().is_empty() => path,
    _ => return Ok(Vec::new()),
  };

  let entries = fs::read_dir(&path).map_err(|error| format!("could_not_read_default_path: {error}"))?;
  let mut items: Vec<LocalLibraryItemDto> = Vec::new();

  for entry in entries {
    let entry = match entry {
      Ok(value) => value,
      Err(_) => continue,
    };
    let metadata = match entry.metadata() {
      Ok(value) => value,
      Err(_) => continue,
    };

    let modified_at = metadata
      .modified()
      .ok()
      .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
      .map(|duration| duration.as_secs())
      .unwrap_or(0);

    items.push(LocalLibraryItemDto {
      name: entry.file_name().to_string_lossy().to_string(),
      path: entry.path().to_string_lossy().to_string(),
      is_dir: metadata.is_dir(),
      size_bytes: if metadata.is_file() { metadata.len() } else { 0 },
      modified_at,
    });
  }

  items.sort_by_key(|b| std::cmp::Reverse(b.modified_at));
  Ok(items)
}

fn is_torrent_sidecar_name(name: &str) -> bool {
  let lower = name.to_ascii_lowercase();
  lower.ends_with(".torrent") || lower.ends_with(".aria2")
}

fn torrent_sidecar_stem(name: &str) -> String {
  let lower = name.to_ascii_lowercase();
  if let Some(stem) = lower.strip_suffix(".torrent") {
    return name[..stem.len()].to_string();
  }
  if let Some(stem) = lower.strip_suffix(".aria2") {
    return name[..stem.len()].to_string();
  }
  name.to_string()
}

fn torrent_sidecar_matches_title(stem: &str, title: &str) -> bool {
  let stem_key = normalize_title_key(&clean_title_for_matching(stem));
  let title_key = normalize_title_key(&clean_title_for_matching(title));
  if stem_key.is_empty() || title_key.is_empty() {
    return false;
  }
  if stem_key == title_key {
    return true;
  }
  title_key.starts_with(&stem_key) || stem_key.starts_with(&title_key)
}

/// Apaga `.torrent` / `.aria2` só se a sementeira estiver desligada.
/// Com "Semear após download" ativo, o motor precisa destes ficheiros.
pub fn maybe_cleanup_torrent_sidecar_files(app: &AppHandle, dest_path: &str, title: &str) {
  let seed_enabled = open_database_connection(app)
    .ok()
    .map(|conn| db::read_app_setting_bool(&conn, "seed_torrents_enabled", true))
    .unwrap_or(true);
  if seed_enabled {
    return;
  }
  cleanup_torrent_sidecar_files(dest_path, title);
}

/// Remove ficheiros `.torrent` / `.aria2` associados a um download (pasta ou título).
pub fn cleanup_torrent_sidecar_files(dest_path: &str, title: &str) {
  let target = PathBuf::from(dest_path.trim());
  if dest_path.trim().is_empty() {
    return;
  }

  let folder = if target.is_dir() {
    target.clone()
  } else {
    target
      .parent()
      .map(Path::to_path_buf)
      .unwrap_or_else(|| target.clone())
  };
  if !folder.is_dir() {
    return;
  }

  let folder_name = folder
    .file_name()
    .and_then(|name| name.to_str())
    .unwrap_or("")
    .to_string();

  let mut search_dirs = vec![folder.clone()];
  if let Some(parent) = folder.parent() {
    if parent.is_dir() {
      search_dirs.push(parent.to_path_buf());
    }
  }

  for dir in search_dirs {
    let Ok(entries) = fs::read_dir(&dir) else {
      continue;
    };
    for entry in entries.flatten() {
      let path = entry.path();
      if !path.is_file() {
        continue;
      }
      let name = entry.file_name().to_string_lossy().to_string();
      if !is_torrent_sidecar_name(&name) {
        continue;
      }
      let stem = torrent_sidecar_stem(&name);
      let matches = torrent_sidecar_matches_title(&stem, title)
        || (!folder_name.is_empty()
          && (stem.eq_ignore_ascii_case(&folder_name)
            || torrent_sidecar_matches_title(&stem, &folder_name)));
      if !matches {
        continue;
      }
      if let Err(error) = fs::remove_file(&path) {
        log::warn!(
          "could_not_remove_torrent_sidecar {}: {error}",
          path.display()
        );
      }
    }
  }
}

fn normalize_library_fs_path(path: &str) -> String {
  path
    .trim()
    .replace('\\', "/")
    .trim_end_matches('/')
    .to_ascii_lowercase()
}

fn library_titles_loose_match(a: &str, b: &str) -> bool {
  let ka = normalize_title_key(&clean_title_for_matching(a));
  let kb = normalize_title_key(&clean_title_for_matching(b));
  if ka.is_empty() || kb.is_empty() {
    return false;
  }
  ka == kb || ka.starts_with(&kb) || kb.starts_with(&ka)
}

fn path_is_same_or_under(child: &str, parent: &str) -> bool {
  let child_n = normalize_library_fs_path(child);
  let parent_n = normalize_library_fs_path(parent);
  if child_n.is_empty() || parent_n.is_empty() {
    return false;
  }
  child_n == parent_n || child_n.starts_with(&(parent_n + "/"))
}

fn job_row_matches_library_item(
  item_path: &str,
  item_title: &str,
  job_dest: &str,
  job_title: &str,
) -> bool {
  let item_path_n = normalize_library_fs_path(item_path);
  let job_dest_n = normalize_library_fs_path(job_dest);
  let titles = !item_title.trim().is_empty() && library_titles_loose_match(item_title, job_title);

  if !item_path_n.is_empty() && item_path_n == job_dest_n {
    return item_title.trim().is_empty() || titles;
  }

  // Job aponta para a raiz de downloads; o item é a pasta do jogo.
  if !item_path_n.is_empty()
    && !job_dest_n.is_empty()
    && item_path_n.starts_with(&(job_dest_n.clone() + "/"))
  {
    let folder_name = item_path_n.rsplit('/').next().unwrap_or("");
    return titles
      || library_titles_loose_match(folder_name, job_title)
      || (!item_title.trim().is_empty() && library_titles_loose_match(folder_name, item_title));
  }

  // Destino do job está dentro da pasta do item.
  if path_is_same_or_under(job_dest, item_path) {
    return item_title.trim().is_empty() || titles;
  }

  titles && (item_path_n.is_empty() || job_dest_n.is_empty())
}

fn purge_library_item_db(conn: &rusqlite::Connection, path: &str, title: &str) -> Result<(), String> {
  let path = path.trim();
  let title = title.trim();
  if path.is_empty() && title.is_empty() {
    return Ok(());
  }

  let path_key = if !path.is_empty() && !title.is_empty() {
    Some(library_note_path_key(path, title))
  } else {
    None
  };
  let library_key = if !path.is_empty() && !title.is_empty() {
    Some(library_entry_key(path, title))
  } else {
    None
  };

  if let Some(key) = path_key.as_deref() {
    let _ = conn.execute("DELETE FROM library_notes WHERE path_key = ?1", params![key]);
    let _ = conn.execute(
      "DELETE FROM library_play_stats WHERE path_key = ?1",
      params![key],
    );
  }
  if !path.is_empty() {
    let prefix = format!("{}::%", path.to_lowercase());
    let _ = conn.execute(
      "DELETE FROM library_notes WHERE lower(path_key) LIKE ?1",
      params![prefix],
    );
    let _ = conn.execute(
      "DELETE FROM library_play_stats WHERE lower(path_key) LIKE ?1",
      params![prefix],
    );
  }
  if let Some(key) = library_key.as_deref() {
    let _ = conn.execute(
      "DELETE FROM library_launch_exe WHERE library_key = ?1",
      params![key],
    );
    let _ = conn.execute(
      "DELETE FROM library_game_roots WHERE library_key = ?1",
      params![key],
    );
  }

  // Metadados guardados com dest_path = raiz de downloads + título do jogo.
  if !title.is_empty() {
    if let Ok(mut stmt) = conn.prepare(
      "SELECT library_key, title, dest_path FROM library_launch_exe",
    ) {
      let rows = stmt
        .query_map([], |row| {
          Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
          ))
        })
        .ok();
      if let Some(rows) = rows {
        let mut keys = Vec::new();
        for row in rows.flatten() {
          if job_row_matches_library_item(path, title, &row.2, &row.1) {
            keys.push(row.0);
          }
        }
        for key in keys {
          let _ = conn.execute(
            "DELETE FROM library_launch_exe WHERE library_key = ?1",
            params![key],
          );
        }
      }
    }
    if let Ok(mut stmt) = conn.prepare(
      "SELECT library_key, title, dest_path FROM library_game_roots",
    ) {
      let rows = stmt
        .query_map([], |row| {
          Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
          ))
        })
        .ok();
      if let Some(rows) = rows {
        let mut keys = Vec::new();
        for row in rows.flatten() {
          if job_row_matches_library_item(path, title, &row.2, &row.1) {
            keys.push(row.0);
          }
        }
        for key in keys {
          let _ = conn.execute(
            "DELETE FROM library_game_roots WHERE library_key = ?1",
            params![key],
          );
        }
      }
    }
  }

  let mut job_ids: Vec<String> = Vec::new();

  let _ = ensure_persisted_queue_table(conn);
  if let Ok(mut stmt) = conn.prepare("SELECT id, title, dest_path FROM persisted_queue_jobs") {
    let rows = stmt
      .query_map([], |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, String>(2)?,
        ))
      })
      .ok();
    if let Some(rows) = rows {
      for row in rows.flatten() {
        if job_row_matches_library_item(path, title, &row.2, &row.1) {
          job_ids.push(row.0);
        }
      }
    }
  }

  if let Ok(mut stmt) = conn.prepare("SELECT CAST(id AS TEXT), title, dest_path FROM download_jobs")
  {
    let rows = stmt
      .query_map([], |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, String>(2)?,
        ))
      })
      .ok();
    if let Some(rows) = rows {
      for row in rows.flatten() {
        if job_row_matches_library_item(path, title, &row.2, &row.1)
          && !job_ids.iter().any(|id| id == &row.0)
        {
          job_ids.push(row.0);
        }
      }
    }
  }

  for id in job_ids {
    let _ = conn.execute("DELETE FROM extraction_log WHERE job_id = ?1", params![id]);
    let _ = conn.execute("DELETE FROM download_jobs WHERE CAST(id AS TEXT) = ?1", params![id]);
    let _ = conn.execute("DELETE FROM persisted_queue_jobs WHERE id = ?1", params![id]);
  }

  Ok(())
}

fn path_under_download_root(target: &Path, base: &Path) -> Result<bool, String> {
  if target.exists() && base.exists() {
    let canonical_base = std::fs::canonicalize(base)
      .map_err(|error| format!("could_not_resolve_base_path: {error}"))?;
    let canonical_target = std::fs::canonicalize(target)
      .map_err(|error| format!("could_not_resolve_target_path: {error}"))?;
    return Ok(canonical_target.starts_with(&canonical_base));
  }
  let target_n = normalize_library_fs_path(&target.to_string_lossy());
  let base_n = normalize_library_fs_path(&base.to_string_lossy());
  Ok(!base_n.is_empty() && path_is_same_or_under(&target_n, &base_n))
}

#[tauri::command]
pub fn delete_local_library_item(
  app: AppHandle,
  payload: DeleteLocalLibraryItemPayload,
) -> Result<(), String> {
  let default_path = get_default_download_path(&app)?
    .ok_or_else(|| "default_download_path_not_configured".to_string())?;

  let base_dir = std::path::PathBuf::from(&default_path);
  let target = std::path::PathBuf::from(payload.path.trim());
  let title_hint = payload
    .title
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(str::to_string)
    .unwrap_or_else(|| {
      target
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("")
        .to_string()
    });

  if !path_under_download_root(&target, &base_dir)? {
    return Err("path_outside_default_download_path".to_string());
  }

  let is_download_root = normalize_library_fs_path(&target.to_string_lossy())
    == normalize_library_fs_path(&default_path)
    || (target.exists()
      && base_dir.exists()
      && std::fs::canonicalize(&target)
        .ok()
        .zip(std::fs::canonicalize(&base_dir).ok())
        .is_some_and(|(a, b)| a == b));

  let parent_for_cleanup = target.parent().map(Path::to_path_buf);

  if target.exists() && !is_download_root {
    let canonical_target = std::fs::canonicalize(&target)
      .map_err(|error| format!("could_not_resolve_target_path: {error}"))?;
    if canonical_target.is_dir() {
      std::fs::remove_dir_all(&canonical_target)
        .map_err(|error| format!("could_not_delete_directory: {error}"))?;
    } else {
      std::fs::remove_file(&canonical_target)
        .map_err(|error| format!("could_not_delete_file: {error}"))?;
    }

    // Apaga .torrent / .aria2 irmãos na pasta de downloads (o aria2 deixa-os fora da pasta do jogo).
    if !title_hint.is_empty() {
      if let Some(parent) = parent_for_cleanup {
        cleanup_torrent_sidecar_files(&parent.to_string_lossy(), &title_hint);
      }
    }
  } else if !target.exists() && title_hint.is_empty() {
    return Err("local_item_not_found".to_string());
  } else if is_download_root && title_hint.is_empty() {
    return Err("cannot_delete_default_download_root".to_string());
  }

  // Limpa fila persistida, notas, stats e exes mesmo quando a pasta já não existe
  // (ou quando o dest_path do job é a raiz de downloads).
  if let Ok(conn) = open_database_connection(&app) {
    let _ = purge_library_item_db(&conn, payload.path.trim(), &title_hint);
  }

  Ok(())
}

#[tauri::command]
pub async fn launch_game_from_path(
  app: AppHandle,
  payload: LaunchGamePayload,
) -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let _validated = crate::path_security::validate_managed_path(&app, &payload.path)?;
    let conn = open_database_connection(&app)?;
    let cached_exe = read_library_launch_exe(&conn, &payload.path, &payload.title);
    let extra_roots = launch_extra_roots(
      &app,
      &payload.title,
      &payload.path,
      payload.job_id.as_deref(),
    );
    let launched = launch::resolve_and_launch_game_with_extra_roots(
      &payload.title,
      &payload.path,
      &extra_roots,
      cached_exe.as_deref(),
    )
    .map_err(|error| launch_errors::map_launch_user_error(&error, &payload.path))?;
    let _ = upsert_library_launch_exe(&conn, &payload.path, &payload.title, &launched);
    let path_key = format!(
      "{}::{}",
      payload.path.to_lowercase(),
      payload.title.to_lowercase()
    );
    let _ = conn.execute(
      "INSERT INTO library_play_stats (path_key, last_played_at, play_count) \
       VALUES (?1, CURRENT_TIMESTAMP, 1) \
       ON CONFLICT(path_key) DO UPDATE SET \
         last_played_at = CURRENT_TIMESTAMP, \
         play_count = play_count + 1",
      params![path_key],
    );
    Ok(launched.to_string_lossy().to_string())
  })
  .await
  .map_err(|error| format!("launch_task_failed: {error}"))?
}

#[tauri::command]
pub fn set_library_game_root(app: AppHandle, payload: SetLibraryGameRootPayload) -> Result<LibraryPathStateDto, String> {
  let _ = crate::path_security::validate_managed_path(&app, &payload.dest_path)?;
  let game_root = crate::path_security::validate_existing_directory(&payload.game_root)
    .map_err(|_| "A pasta escolhida não existe.".to_string())?;
  if !launch::folder_has_playable_game_exe(&payload.title, &game_root) {
    return Err(
      "Não encontramos um executável jogável nessa pasta. Escolha a pasta onde o jogo foi instalado (com o .exe do jogo)."
        .to_string(),
    );
  }

  let conn = open_database_connection(&app)?;
  upsert_library_game_root(&conn, &payload.dest_path, &payload.title, &game_root)?;
  Ok(inspect_library_path_internal(
    &app,
    &payload.title,
    &payload.dest_path,
    payload.job_id.as_deref(),
  ))
}

#[tauri::command]
pub fn set_library_launch_exe(app: AppHandle, payload: SetLibraryLaunchExePayload) -> Result<(), String> {
  let _ = crate::path_security::validate_managed_path(&app, &payload.dest_path)?;
  let exe_path = crate::path_security::validate_absolute_user_path(&payload.exe_path)?;
  let _ = crate::path_security::validate_managed_path(&app, &payload.exe_path)?;
  if !exe_path.is_file() {
    return Err("O ficheiro .exe escolhido não existe.".to_string());
  }
  let conn = open_database_connection(&app)?;
  upsert_library_launch_exe(&conn, &payload.dest_path, &payload.title, &exe_path)?;
  Ok(())
}

fn library_note_path_key(path: &str, title: &str) -> String {
  format!("{}::{}", path.to_lowercase(), title.to_lowercase())
}

#[tauri::command]
pub fn get_library_note(app: AppHandle, payload: LibraryNotePayload) -> Result<String, String> {
  let path = payload.path.trim();
  let title = payload.title.trim();
  if path.is_empty() || title.is_empty() {
    return Ok(String::new());
  }
  let conn = open_database_connection(&app)?;
  let key = library_note_path_key(path, title);
  Ok(
    conn
      .query_row(
        "SELECT note FROM library_notes WHERE path_key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
      )
      .unwrap_or_default(),
  )
}

#[tauri::command]
pub fn set_library_note(app: AppHandle, payload: LibraryNotePayload) -> Result<(), String> {
  let path = payload.path.trim();
  let title = payload.title.trim();
  if path.is_empty() || title.is_empty() {
    return Err("library_note_path_or_title_empty".to_string());
  }
  let note = payload.note.unwrap_or_default();
  let conn = open_database_connection(&app)?;
  let key = library_note_path_key(path, title);
  if note.trim().is_empty() {
    conn
      .execute("DELETE FROM library_notes WHERE path_key = ?1", params![key])
      .map_err(|e| format!("could_not_clear_library_note: {e}"))?;
  } else {
    conn
      .execute(
        "INSERT INTO library_notes (path_key, note) VALUES (?1, ?2) \
         ON CONFLICT(path_key) DO UPDATE SET note = excluded.note",
        params![key, note],
      )
      .map_err(|e| format!("could_not_save_library_note: {e}"))?;
  }
  Ok(())
}

pub fn folder_extraction_job_id(path: &str) -> String {
  let mut hasher = DefaultHasher::new();
  path.to_lowercase().hash(&mut hasher);
  format!("folder:{:x}", hasher.finish())
}

pub fn inspect_library_path_internal(
  app: &AppHandle,
  title: &str,
  path: &str,
  job_id: Option<&str>,
) -> LibraryPathStateDto {
  let extra_roots = launch_extra_roots(app, title, path, job_id);
  let custom_game_root = open_database_connection(app)
    .ok()
    .and_then(|conn| read_library_game_root(&conn, path, title))
    .map(|path| path.to_string_lossy().to_string());
  let content_path = launch::resolve_game_content_root(title, path)
    .to_string_lossy()
    .to_string();
  let candidates_result =
    launch::resolve_launch_candidates_with_extra_roots(title, path, &extra_roots);
  let install_path = launch::find_setup_executable_with_extra_roots(title, path, &extra_roots)
    .map(|p| p.to_string_lossy().to_string());

  // FitGirl / repacks: com setup.exe e sem pasta de instalação escolhida,
  // mostrar Instalar — mesmo que exista algum .exe na pasta do download.
  let mut has_game = if install_path.is_some() && custom_game_root.is_none() {
    false
  } else {
    candidates_result.is_ok()
  };

  if let Some(ref root) = custom_game_root {
    if launch::folder_has_playable_game_exe(title, std::path::Path::new(root)) {
      has_game = true;
    }
  }

  if has_game {
    if let Ok(ref candidates) = candidates_result {
      if let Some(first) = candidates.first() {
        if let Ok(conn) = open_database_connection(app) {
          let _ = upsert_library_launch_exe(&conn, path, title, first);
        }
      }
    }
  }

  let needs_install = !has_game && install_path.is_some();
  if needs_install {
    if let Ok(conn) = open_database_connection(app) {
      let _ = clear_library_launch_exe(&conn, path, title);
    }
  }
  let has_archive = archive::find_job_archive(&content_path).is_some();
  // FitGirl e similares: setup.exe + .rar na mesma pasta — não forçar extração.
  let needs_extraction = has_archive && !has_game && install_path.is_none();

  LibraryPathStateDto {
    has_game,
    needs_install,
    install_path,
    needs_extraction,
    playable: has_game,
    custom_game_root,
  }
}

#[tauri::command]
pub fn inspect_library_path(app: AppHandle, payload: LaunchGamePayload) -> LibraryPathStateDto {
  inspect_library_path_internal(&app, &payload.title, &payload.path, payload.job_id.as_deref())
}

#[tauri::command]
pub async fn inspect_library_paths(
  app: AppHandle,
  payload: InspectLibraryPathsPayload,
) -> Result<Vec<InspectLibraryPathResultItem>, String> {
  tauri::async_runtime::spawn_blocking(move || {
    payload
      .entries
      .into_iter()
      .map(|entry| InspectLibraryPathResultItem {
        key: entry.key,
        state: inspect_library_path_internal(
          &app,
          &entry.title,
          &entry.path,
          entry.job_id.as_deref(),
        ),
      })
      .collect()
  })
  .await
  .map_err(|error| format!("inspect_library_paths_failed: {error}"))
}

#[tauri::command]
pub async fn launch_setup_from_path(app: AppHandle, payload: LaunchGamePayload) -> Result<String, String> {
  let preferred_setup = payload
    .preferred_setup
    .as_ref()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());

  if let Some(job_id) = payload.job_id.clone() {
    let app_pause = app.clone();
    tauri::async_runtime::spawn(async move {
      let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(4))
        .build()
      {
        Ok(value) => value,
        Err(_) => return,
      };
      let Ok(port) = ensure_sidecar_running(app_pause.clone()).await else {
        return;
      };
      let _ = client
        .post(format!("http://127.0.0.1:{port}/jobs/{job_id}/pause"))
        .send()
        .await;
    });
  }

  tauri::async_runtime::spawn_blocking(move || {
    let _ = crate::path_security::validate_managed_path(&app, &payload.path)?;
    let extra_roots = payload
      .job_id
      .as_deref()
      .map(|job_id| db::extraction_roots_for_job(&app, job_id))
      .unwrap_or_default();

    let setup = preferred_setup
      .as_deref()
      .map(std::path::PathBuf::from)
      .filter(|path| launch::is_usable_setup_path(path))
      .or_else(|| {
        launch::find_setup_executable_with_extra_roots(
          &payload.title,
          &payload.path,
          &extra_roots,
        )
      })
      .ok_or_else(|| {
        "Nenhum instalador (setup.exe) encontrado na pasta do download.".to_string()
      })?;

    let install_dir = launch::resolve_game_content_root(&payload.title, &payload.path);
    if !setup.is_file() {
      return Err(
        "setup.exe ainda não está disponível na pasta. Aguarde o download terminar.".to_string(),
      );
    }
    if !install_dir.exists() {
      return Err("Pasta do repack não encontrada. Aguarde o download terminar.".to_string());
    }

    launch::spawn_setup_executable_in(&setup, Some(&install_dir))
      .map_err(|error| launch_errors::map_launch_user_error(&error, &payload.path))?;
    Ok(setup.to_string_lossy().to_string())
  })
  .await
  .map_err(|error| format!("launch_setup_task_failed: {error}"))?
}

#[tauri::command]
pub fn is_executable_running_at_path(app: AppHandle, path: String) -> bool {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return false;
  }
  if crate::path_security::validate_managed_path(&app, trimmed).is_err() {
    return false;
  }
  launch::is_executable_running(std::path::Path::new(trimmed))
}

#[tauri::command]
pub async fn extract_library_folder(app: AppHandle, payload: LaunchGamePayload) -> Result<(), String> {
  let extraction = app.state::<ExtractionState>();
  if !extraction.try_acquire() {
    return Err("extraction_busy".to_string());
  }

  let job_id = folder_extraction_job_id(&payload.path);
  let app_clone = app.clone();
  let title = payload.title.clone();
  let dest_path = payload.path.clone();

  let result = if archive::find_job_archive(&dest_path).is_some() {
    process_job_extraction(app_clone.clone(), job_id.clone(), title, dest_path).await
  } else {
    process_job_post_download(app_clone.clone(), job_id.clone(), title, dest_path).await
  };
  extraction.release();

  if let Err(ref error) = result {
    if let Ok(conn) = open_database_connection(&app_clone) {
      let _ = db::upsert_extraction_log(
        &conn,
        &job_id,
        "failed",
        None,
        None,
        Some(error.as_str()),
      );
    }
    emit_extract_status(&app_clone, &job_id, "failed", Some(error.clone()));
  }
  result
}

#[cfg(test)]
mod torrent_cleanup_tests {
  use super::{cleanup_torrent_sidecar_files, torrent_sidecar_matches_title};
  use std::fs;
  use std::path::PathBuf;

  fn temp_dir(label: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
      "launcher_torrent_cleanup_{label}_{}",
      std::process::id()
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
  }

  #[test]
  fn matches_title_to_fitgirl_style_torrent_stem() {
    assert!(torrent_sidecar_matches_title(
      "Stardew Valley-FitGirl Repack",
      "Stardew Valley"
    ));
  }

  #[test]
  fn deletes_matching_torrent_and_aria2_beside_game_folder() {
    let root = temp_dir("match");
    let game = root.join("Stardew Valley");
    fs::create_dir_all(&game).unwrap();
    fs::write(game.join("setup.exe"), b"x").unwrap();
    let torrent = root.join("Stardew Valley.torrent");
    let aria2 = root.join("Stardew Valley.aria2");
    let other = root.join("Other Game.torrent");
    fs::write(&torrent, b"torrent").unwrap();
    fs::write(&aria2, b"aria2").unwrap();
    fs::write(&other, b"keep").unwrap();

    cleanup_torrent_sidecar_files(&game.to_string_lossy(), "Stardew Valley");

    assert!(!torrent.exists(), "torrent do jogo deveria ser apagado");
    assert!(!aria2.exists(), "aria2 do jogo deveria ser apagado");
    assert!(other.exists(), "torrent de outro jogo não deve ser apagado");

    let _ = fs::remove_dir_all(&root);
  }

  #[test]
  fn deletes_torrent_inside_dest_folder_by_folder_name() {
    let root = temp_dir("inside");
    let game = root.join("Pixel Harvest");
    fs::create_dir_all(&game).unwrap();
    let torrent = game.join("Pixel Harvest.torrent");
    fs::write(&torrent, b"torrent").unwrap();

    cleanup_torrent_sidecar_files(&game.to_string_lossy(), "Pixel Harvest");

    assert!(!torrent.exists());
    let _ = fs::remove_dir_all(&root);
  }

  #[test]
  fn does_not_delete_unrelated_hash_named_torrent() {
    let root = temp_dir("hash");
    let game = root.join("Galaxy Rangers");
    fs::create_dir_all(&game).unwrap();
    let hash_torrent = root.join("a1b2c3d4e5f67890.torrent");
    fs::write(&hash_torrent, b"hash").unwrap();

    cleanup_torrent_sidecar_files(&game.to_string_lossy(), "Galaxy Rangers");

    assert!(
      hash_torrent.exists(),
      "nome por hash sem relação com o título não deve ser apagado"
    );
    let _ = fs::remove_dir_all(&root);
  }
}

