use crate::dto::{
  ExtractStatusEvent, JobProgressEvent, EXTRACT_EVENT_STATUS, QUEUE_EVENT_JOB_PROGRESS,
};
use tauri::{AppHandle, Emitter};

pub(crate) async fn request_continue_torrent_content(
  app: &AppHandle,
  job_id: &str,
) -> Result<(), String> {
  let port = super::super::engine::ensure_sidecar_running(app.clone()).await?;
  let response = reqwest::Client::new()
    .post(format!("http://127.0.0.1:{port}/jobs/{job_id}/continue-torrent"))
    .send()
    .await
    .map_err(|error| format!("sidecar_request_failed: {error}"))?;
  if response.status().is_success() {
    Ok(())
  } else {
    Err(format!(
      "continue_torrent_failed: {}",
      response.text().await.unwrap_or_default()
    ))
  }
}

pub fn emit_extract_status(
  app: &AppHandle,
  job_id: &str,
  status: &str,
  message: Option<String>,
) {
  let _ = app.emit(
    EXTRACT_EVENT_STATUS,
    ExtractStatusEvent {
      job_id: job_id.to_string(),
      status: status.to_string(),
      message,
    },
  );
}

pub(crate) fn emit_continue_progress(app: &AppHandle, job_id: &str) {
  let _ = app.emit(
    QUEUE_EVENT_JOB_PROGRESS,
    JobProgressEvent {
      job_id: job_id.to_string(),
      progress: 0.0,
      status: "downloading".to_string(),
      speed_bytes_per_sec: 0,
      eta_seconds: 0,
      bytes_downloaded: None,
      total_bytes: None,
      error_msg: Some("A obter o conteúdo do torrent…".to_string()),
    },
  );
}
