use crate::db::{
  get_extraction_status, open_database_connection, upsert_extraction_log,
};
use crate::library::maybe_cleanup_torrent_sidecar_files;
use tauri::AppHandle;

fn mark_skipped(app: &AppHandle, job_id: &str, message: &str) -> Result<(), String> {
  let conn = open_database_connection(app)?;
  upsert_extraction_log(&conn, job_id, "skipped", None, None, None)?;
  super::emit_extract_status(app, job_id, "skipped", Some(message.to_string()));
  Ok(())
}

async fn handle_verify_failure(
  app: &AppHandle,
  job_id: &str,
  message: String,
) -> Result<(), String> {
  if message.contains("verify_too_small") || message.contains("verify_no_file") {
    let _ = super::request_continue_torrent_content(app, job_id).await;
    super::emit_continue_progress(app, job_id);
    return Ok(());
  }
  let conn = open_database_connection(app)?;
  upsert_extraction_log(
    &conn, job_id, "verify_failed", None, None, Some(&message),
  )?;
  let _ = crate::queue::persist::update_persisted_queue_status(
    &conn, job_id, "failed", Some(&message),
  );
  super::emit_extract_status(app, job_id, "verify_failed", Some(message.clone()));
  Err(message)
}

pub async fn process_job_post_download(
  app: AppHandle,
  job_id: String,
  title: String,
  dest_path: String,
) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  let prior = get_extraction_status(&conn, &job_id);
  // verified: continuar para extract/skip. failed: permitir nova tentativa manual.
  if matches!(
    prior.as_deref(),
    Some("extracting") | Some("extracted") | Some("verify_failed") | Some("verified")
  ) {
    // verified: já passou verify; o watcher continua no extract/skip sem re-verify.
    if matches!(prior.as_deref(), Some("verified")) {
      let content = crate::launch::resolve_game_content_root(&title, &dest_path);
      let content_str = content.to_string_lossy().to_string();
      if super::finalize_job_if_playable(&app, &job_id, &title, &content_str)? {
        maybe_cleanup_torrent_sidecar_files(&app, &dest_path, &title);
        return Ok(());
      }
      if crate::archive::find_job_archive_for_title(&content_str, &title).is_some()
        || crate::archive::find_job_archive_for_title(&dest_path, &title).is_some()
        || crate::archive::find_job_archive(&content_str).is_some()
        || crate::archive::find_job_archive(&dest_path).is_some()
      {
        return super::process_job_extraction(app, job_id, title, dest_path).await;
      }
      let message = if crate::launch::find_setup_executable(&title, &content_str).is_some() {
        "Download concluído — clique em INSTALAR para executar o setup.exe."
      } else {
        "Download concluído — use INSTALAR se houver setup.exe, ou abra a pasta."
      };
      mark_skipped(&app, &job_id, message)?;
      maybe_cleanup_torrent_sidecar_files(&app, &dest_path, &title);
      return Ok(());
    }
    return Ok(());
  }
  // Allow re-processing wrongly skipped / failed jobs when an archive is present.
  if matches!(prior.as_deref(), Some("skipped") | Some("failed")) {
    let content = crate::launch::resolve_game_content_root(&title, &dest_path);
    let content_str = content.to_string_lossy();
    let has_archive = crate::archive::find_job_archive_for_title(content_str.as_ref(), &title)
      .is_some()
      || crate::archive::find_job_archive_for_title(&dest_path, &title).is_some()
      || crate::archive::find_job_archive(content_str.as_ref()).is_some()
      || crate::archive::find_job_archive(&dest_path).is_some();
    if !has_archive {
      if matches!(prior.as_deref(), Some("skipped")) {
        maybe_cleanup_torrent_sidecar_files(&app, &dest_path, &title);
        return Ok(());
      }
      // failed sem arquivo: cair no fluxo normal (verify) para mensagem atualizada
    } else {
      drop(conn);
      return super::process_job_extraction(app, job_id, title, dest_path).await;
    }
  }
  drop(conn);

  let content = crate::launch::resolve_game_content_root(&title, &dest_path);
  let content_str = content.to_string_lossy().to_string();

  match super::verify_download_payload(&content_str)
    .or_else(|_| super::verify_download_payload(&dest_path))
  {
    Ok(file) => {
      let conn = open_database_connection(&app)?;
      upsert_extraction_log(
        &conn, &job_id, "verified", Some(&file.to_string_lossy()), None, None,
      )?;
    }
    Err(message) => return handle_verify_failure(&app, &job_id, message).await,
  }

  if super::finalize_job_if_playable(&app, &job_id, &title, &content_str)? {
    maybe_cleanup_torrent_sidecar_files(&app, &dest_path, &title);
    return Ok(());
  }

  if crate::archive::find_job_archive_for_title(&content_str, &title).is_some()
    || crate::archive::find_job_archive_for_title(&dest_path, &title).is_some()
    || crate::archive::find_job_archive(&content_str).is_some()
    || crate::archive::find_job_archive(&dest_path).is_some()
  {
    return super::process_job_extraction(app, job_id, title, dest_path).await;
  }

  let message = if crate::launch::find_setup_executable(&title, &content_str).is_some()
    || crate::launch::find_setup_executable(&title, &dest_path).is_some()
  {
    "Download concluído — clique em INSTALAR para executar o setup.exe."
  } else {
    "Download concluído — use INSTALAR se houver setup.exe, ou abra a pasta."
  };
  mark_skipped(&app, &job_id, message)?;
  maybe_cleanup_torrent_sidecar_files(&app, &dest_path, &title);
  Ok(())
}
