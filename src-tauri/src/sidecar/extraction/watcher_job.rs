use crate::db::{get_extraction_status, open_database_connection, upsert_extraction_log};
use crate::dto::SidecarJobWatcher;
use crate::state::ExtractionState;
use tauri::{AppHandle, Manager};

async fn continue_content(app: AppHandle, job_id: String) {
  let _ = super::request_continue_torrent_content(&app, &job_id).await;
  super::emit_continue_progress(&app, &job_id);
  if let Ok(conn) = open_database_connection(&app) {
    let _ = upsert_extraction_log(&conn, &job_id, "pending_content", None, None, None);
  }
  app.state::<ExtractionState>().release();
}

fn spawn_continue(app: &AppHandle, job_id: String) {
  tauri::async_runtime::spawn(continue_content(app.clone(), job_id));
}

fn spawn_post_download(app: &AppHandle, job: SidecarJobWatcher) {
  let app = app.clone();
  tauri::async_runtime::spawn(async move {
    if let Err(error) = super::process_job_post_download(
      app.clone(), job.id.clone(), job.title, job.dest_path,
    ).await {
      if !error.contains("verify_too_small") && !error.contains("verify_no_file") {
        if let Ok(conn) = open_database_connection(&app) {
          let _ = upsert_extraction_log(
            &conn, &job.id, "failed", None, None, Some(&error),
          );
        }
        super::emit_extract_status(&app, &job.id, "failed", Some(error));
      }
    }
    app.state::<ExtractionState>().release();
  });
}

pub(crate) async fn start_job_if_ready(
  app: &AppHandle,
  job: SidecarJobWatcher,
) -> bool {
  let prior = open_database_connection(app)
    .ok()
    .and_then(|conn| get_extraction_status(&conn, &job.id));
  if matches!(
    prior.as_deref(),
    Some("extracting") | Some("extracted")
  ) {
    return false;
  }
  let completed = matches!(job.status.as_str(), "completed" | "seeding");
  if prior.as_deref() == Some("pending_content") {
    if !completed || super::job_reported_metadata_only(&job) {
      return false;
    }
    if !super::dest_has_game_content_async(job.title.clone(), job.dest_path.clone()).await {
      return false;
    }
  } else if matches!(prior.as_deref(), Some("verify_failed") | Some("failed"))
    || (matches!(job.status.as_str(), "completed" | "seeding" | "failed")
      && super::job_reported_metadata_only(&job))
  {
    spawn_continue(app, job.id);
    return true;
  } else if completed {
    if super::job_reported_metadata_only(&job) {
      return false;
    }
    if !super::dest_has_game_content_async(job.title.clone(), job.dest_path.clone()).await {
      if job.total_bytes.max(job.bytes_downloaded) <= 0 {
        spawn_continue(app, job.id);
        return true;
      }
      return false;
    }
  } else {
    return false;
  }
  spawn_post_download(app, job);
  true
}
