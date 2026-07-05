pub mod roots;

use crate::db::{get_default_download_path, open_database_connection};
use crate::dto::{
  DeleteLocalLibraryItemPayload, LaunchGamePayload, LibraryPathStateDto,
  LocalLibraryItemDto, SetLibraryGameRootPayload,
};
use crate::launch;
use crate::launch_errors;
use crate::library::roots::{launch_extra_roots, read_library_game_root, upsert_library_game_root};
use crate::sidecar::{
  emit_extract_status, ensure_sidecar_running, process_job_post_download,
};
use crate::state::ExtractionState;
use crate::{archive, db};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
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

#[tauri::command]
pub fn delete_local_library_item(
  app: AppHandle,
  payload: DeleteLocalLibraryItemPayload,
) -> Result<(), String> {
  let default_path = get_default_download_path(&app)?
    .ok_or_else(|| "default_download_path_not_configured".to_string())?;

  let base_dir = std::path::PathBuf::from(default_path);
  let target = std::path::PathBuf::from(payload.path);

  if !target.exists() {
    return Err("local_item_not_found".to_string());
  }

  let canonical_base = std::fs::canonicalize(&base_dir)
    .map_err(|error| format!("could_not_resolve_base_path: {error}"))?;
  let canonical_target = std::fs::canonicalize(&target)
    .map_err(|error| format!("could_not_resolve_target_path: {error}"))?;

  if !canonical_target.starts_with(&canonical_base) {
    return Err("path_outside_default_download_path".to_string());
  }

  if canonical_target.is_dir() {
    std::fs::remove_dir_all(&canonical_target)
      .map_err(|error| format!("could_not_delete_directory: {error}"))?;
  } else {
    std::fs::remove_file(&canonical_target)
      .map_err(|error| format!("could_not_delete_file: {error}"))?;
  }

  Ok(())
}

#[tauri::command]
pub fn launch_game_from_path(app: AppHandle, payload: LaunchGamePayload) -> Result<String, String> {
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
  )
  .map_err(|error| launch_errors::map_launch_user_error(&error, &payload.path))?;
  Ok(launched.to_string_lossy().to_string())
}

#[tauri::command]
pub fn set_library_game_root(app: AppHandle, payload: SetLibraryGameRootPayload) -> Result<LibraryPathStateDto, String> {
  let game_root = PathBuf::from(payload.game_root.trim());
  if !game_root.is_dir() {
    return Err("A pasta escolhida não existe.".to_string());
  }
  if !launch::folder_has_playable_game_exe(&payload.title, &game_root) {
    return Err(
      "Não encontrámos um executável jogável nessa pasta. Escolha a pasta onde o jogo foi instalado (com o .exe do jogo)."
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
  let has_game =
    launch::resolve_launch_candidates_with_extra_roots(title, path, &extra_roots).is_ok();
  let install_path = launch::find_setup_executable_with_extra_roots(title, path, &extra_roots)
    .map(|p| p.to_string_lossy().to_string());
  let needs_install = !has_game && install_path.is_some();
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
pub async fn launch_setup_from_path(app: AppHandle, payload: LaunchGamePayload) -> Result<String, String> {
  let extra_roots = payload
    .job_id
    .as_deref()
    .map(|job_id| db::extraction_roots_for_job(&app, job_id))
    .unwrap_or_default();

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

  let setup = launch::find_setup_executable_with_extra_roots(
    &payload.title,
    &payload.path,
    &extra_roots,
  )
  .ok_or_else(|| {
    "Nenhum instalador (setup.exe) encontrado na pasta do download.".to_string()
  })?;
  let install_dir = launch::resolve_game_content_root(&payload.title, &payload.path);
  if !setup.is_file() {
    return Err("setup.exe ainda não está disponível na pasta. Aguarde o download terminar.".to_string());
  }
  if !install_dir.exists() {
    return Err("Pasta do repack não encontrada. Aguarde o download terminar.".to_string());
  }

  launch::spawn_setup_executable_in(&setup, Some(&install_dir))
    .map_err(|error| launch_errors::map_launch_user_error(&error, &payload.path))?;
  Ok(setup.to_string_lossy().to_string())
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

  let result = process_job_post_download(app_clone.clone(), job_id.clone(), title, dest_path).await;
  extraction.release();

  if let Err(ref error) = result {
    let _ = db::upsert_extraction_log(
      &open_database_connection(&app_clone)?,
      &job_id,
      "failed",
      None,
      None,
      Some(error),
    );
    emit_extract_status(&app_clone, &job_id, "failed", Some(error.clone()));
  }
  result
}

#[tauri::command]
pub fn check_path_playable(app: AppHandle, payload: LaunchGamePayload) -> bool {
  let extra_roots = launch_extra_roots(
    &app,
    &payload.title,
    &payload.path,
    payload.job_id.as_deref(),
  );
  launch::resolve_launch_candidates_with_extra_roots(&payload.title, &payload.path, &extra_roots).is_ok()
}
