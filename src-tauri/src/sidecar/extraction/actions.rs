use crate::archive;
use crate::config::MIN_DOWNLOAD_VERIFY_BYTES;
use crate::db::{open_database_connection, read_app_setting, upsert_extraction_log};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub fn run_after_install_action(
  app: &AppHandle,
  title: &str,
  dest_path: &str,
  extract_dest: &Path,
) {
  let Ok(conn) = open_database_connection(app) else { return };
  let action = read_app_setting(&conn, "after_install_action")
    .unwrap_or_else(|| "ask".to_string());
  drop(conn);
  match action.as_str() {
    "open-folder" => {
      if let Err(error) = crate::library::roots::open_path_in_shell(extract_dest) {
        log::warn!("after_install_open_folder_failed: {error}");
      }
    }
    "launch-game" => {
      if let Err(error) = crate::launch::resolve_and_launch_game(title, dest_path) {
        log::warn!("after_install_launch_failed: {error}");
      }
    }
    _ => {}
  }
}

pub fn finalize_job_if_playable(
  app: &AppHandle,
  job_id: &str,
  title: &str,
  dest_path: &str,
) -> Result<bool, String> {
  if crate::launch::find_setup_executable(title, dest_path).is_some() {
    return Ok(false);
  }
  let candidates = match crate::launch::resolve_launch_candidates(title, dest_path) {
    Ok(items) => items,
    Err(_) => return Ok(false),
  };
  let extract_path = candidates
    .first()
    .and_then(|path| path.parent())
    .map(|path| path.to_string_lossy().to_string());
  let conn = open_database_connection(app)?;
  upsert_extraction_log(
    &conn, job_id, "extracted", None, extract_path.as_deref(), None,
  )?;
  super::emit_extract_status(
    app,
    job_id,
    "extracted",
    Some("Executável encontrado na pasta — extração não necessária".to_string()),
  );
  Ok(true)
}

pub fn verify_download_payload(dest_path: &str) -> Result<PathBuf, String> {
  let file = archive::find_download_payload(dest_path).ok_or_else(|| {
    "verify_no_file: nenhum ficheiro válido encontrado na pasta do download".to_string()
  })?;
  if !file.is_file() {
    return Err("verify_missing: ficheiro não existe".to_string());
  }
  let size = std::fs::metadata(&file)
    .map_err(|error| format!("verify_stat: {error}"))?
    .len();
  if size < MIN_DOWNLOAD_VERIFY_BYTES {
    return Err(format!(
      "verify_too_small: ficheiro muito pequeno ({size} bytes, mínimo {MIN_DOWNLOAD_VERIFY_BYTES})"
    ));
  }
  Ok(file)
}
