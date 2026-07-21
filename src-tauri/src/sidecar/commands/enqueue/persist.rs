use crate::db::open_database_connection;
use crate::dto::SidecarEnqueuePayload;
use crate::queue::persist::{upsert_persisted_queue_job, PersistedQueueJob};
use tauri::AppHandle;

pub(crate) fn persist_enqueued_job(
  app: &AppHandle,
  job: &serde_json::Value,
  payload: &SidecarEnqueuePayload,
  job_url: &str,
  dest_path: &str,
) {
  let (Some(id), Some(title)) = (
    job.get("id").and_then(|v| v.as_str()),
    job
      .get("title")
      .and_then(|v| v.as_str())
      .or(Some(payload.title.as_str())),
  ) else {
    return;
  };

  if let Ok(conn) = open_database_connection(app) {
    let persisted = PersistedQueueJob {
      id: id.to_string(),
      title: title.to_string(),
      url: job
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or(job_url)
        .to_string(),
      dest_path: job
        .get("destPath")
        .or_else(|| job.get("dest_path"))
        .and_then(|v| v.as_str())
        .unwrap_or(dest_path)
        .to_string(),
      status: job
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("pending")
        .to_string(),
      priority: job
        .get("priority")
        .and_then(|v| v.as_i64())
        .unwrap_or(payload.priority.unwrap_or(0) as i64) as i32,
      progress: job
        .get("progress")
        .and_then(|v| v.as_f64())
        .map(|v| v.round() as i64)
        .unwrap_or(0),
      bytes_downloaded: job
        .get("bytesDownloaded")
        .or_else(|| job.get("bytes_downloaded"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0),
      total_bytes: job
        .get("totalBytes")
        .or_else(|| job.get("total_bytes"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0),
      error_msg: None,
    };
    let _ = upsert_persisted_queue_job(&conn, &persisted);
  }
}
