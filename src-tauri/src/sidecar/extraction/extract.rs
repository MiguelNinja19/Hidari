use crate::db::{
  get_extraction_status, open_database_connection, read_app_setting, read_app_setting_bool,
  upsert_extraction_log,
};
use crate::dto::SidecarJobForLaunch;
use crate::library::maybe_cleanup_torrent_sidecar_files;
use crate::queue::persist::{list_history_persisted_jobs, list_resumable_persisted_jobs};
use crate::state::ExtractionState;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn find_archive_for_job(title: &str, dest_path: &str) -> Option<PathBuf> {
  let content_root = crate::launch::resolve_game_content_root(title, dest_path);
  let content_str = content_root.to_string_lossy().to_string();
  crate::archive::find_job_archive_for_title(&content_str, title)
    .or_else(|| crate::archive::find_job_archive_for_title(dest_path, title))
    .or_else(|| crate::archive::find_job_archive(&content_str))
    .or_else(|| crate::archive::find_job_archive(dest_path))
}

async fn resolve_job_for_extract(app: &AppHandle, id: &str) -> Result<SidecarJobForLaunch, String> {
  match super::super::engine::fetch_sidecar_job(app, id).await {
    Ok(job) => Ok(job),
    Err(_) => {
      let conn = open_database_connection(app)?;
      let mut jobs = list_resumable_persisted_jobs(&conn).unwrap_or_default();
      jobs.extend(list_history_persisted_jobs(&conn).unwrap_or_default());
      jobs
        .into_iter()
        .find(|job| job.id == id)
        .map(|job| SidecarJobForLaunch {
          id: job.id,
          title: job.title,
          dest_path: job.dest_path,
        })
        .ok_or_else(|| format!("job_not_found: {id}"))
    }
  }
}

pub async fn process_job_extraction(
  app: AppHandle,
  job_id: String,
  title: String,
  dest_path: String,
) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  let prior = get_extraction_status(&conn, &job_id);
  if matches!(prior.as_deref(), Some("extracting") | Some("extracted")) {
    return Ok(());
  }
  let organization = read_app_setting(&conn, "install_organization")
    .unwrap_or_else(|| "separate-folder".to_string());
  let remove_temp = read_app_setting_bool(&conn, "remove_temp_files", true);
  drop(conn);

  let content_root = crate::launch::resolve_game_content_root(&title, &dest_path);
  let archive = find_archive_for_job(&title, &dest_path).ok_or_else(|| {
    "no_archive_found: nenhum arquivo compactado encontrado".to_string()
  })?;
  let extract_dest =
    crate::archive::resolve_extract_destination(&title, &content_root, &organization);

  let conn = open_database_connection(&app)?;
  upsert_extraction_log(
    &conn,
    &job_id,
    "extracting",
    Some(&archive.to_string_lossy()),
    Some(&extract_dest.to_string_lossy()),
    None,
  )?;
  drop(conn);
  super::emit_extract_status(&app, &job_id, "extracting", None);
  let seven_zip = super::resolve_7z_path(&app)?;
  super::run_7z_extract(&seven_zip, &archive, &extract_dest)?;
  if remove_temp && archive.exists() {
    if let Err(error) = std::fs::remove_file(&archive) {
      log::warn!("could_not_remove_archive_after_extract: {error}");
    }
  }
  let conn = open_database_connection(&app)?;
  upsert_extraction_log(
    &conn,
    &job_id,
    "extracted",
    Some(&archive.to_string_lossy()),
    Some(&extract_dest.to_string_lossy()),
    None,
  )?;
  drop(conn);
  super::emit_extract_status(&app, &job_id, "extracted", None);
  maybe_cleanup_torrent_sidecar_files(&app, &dest_path, &title);
  super::run_after_install_action(&app, &title, &dest_path, &extract_dest);
  Ok(())
}

#[tauri::command]
pub async fn extract_job_archive(app: AppHandle, id: String) -> Result<(), String> {
  let job = resolve_job_for_extract(&app, &id).await?;
  let extraction = app.state::<ExtractionState>();
  if !extraction.try_acquire() {
    return Err("extraction_busy".to_string());
  }
  let result = if find_archive_for_job(&job.title, &job.dest_path).is_some() {
    process_job_extraction(
      app.clone(),
      job.id.clone(),
      job.title.clone(),
      job.dest_path.clone(),
    )
    .await
  } else {
    super::process_job_post_download(
      app.clone(),
      job.id.clone(),
      job.title.clone(),
      job.dest_path.clone(),
    )
    .await
  };
  extraction.release();
  if let Err(error) = &result {
    if let Ok(conn) = open_database_connection(&app) {
      let _ = upsert_extraction_log(&conn, &id, "failed", None, None, Some(error));
    }
    super::emit_extract_status(&app, &id, "failed", Some(error.clone()));
  }
  result
}
