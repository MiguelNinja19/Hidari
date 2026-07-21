use tauri::AppHandle;

use super::identity::job_identity_key;
use super::super::types::PersistedQueueJob;
use super::super::write::{delete_persisted_queue_job, upsert_persisted_queue_job};

pub(super) async fn create_restored_sidecar_job(
  _app: &AppHandle,
  client: &reqwest::Client,
  port: u16,
  job: &PersistedQueueJob,
) -> Option<(String, serde_json::Value)> {
  let body = serde_json::json!({
    "title": job.title,
    "url": job.url,
    "destPath": job.dest_path,
    "priority": job.priority,
  });

  let created = match client
    .post(format!("http://127.0.0.1:{port}/jobs"))
    .json(&body)
    .send()
    .await
  {
    Ok(response) => match response.json::<serde_json::Value>().await {
      Ok(value) => value,
      Err(error) => {
        log::warn!("restore_persisted_queue_jobs: parse create failed id={}: {error}", job.id);
        return None;
      }
    },
    Err(error) => {
      log::warn!("restore_persisted_queue_jobs: create failed id={}: {error}", job.id);
      return None;
    }
  };

  let Some(new_id) = created
    .get("id")
    .and_then(|v| v.as_str())
    .map(str::to_string)
  else {
    log::warn!("restore_persisted_queue_jobs: missing id for {}", job.id);
    return None;
  };

  Some((new_id, created))
}

pub(super) fn persist_restored_job(
  app: &AppHandle,
  job: &PersistedQueueJob,
  new_id: &str,
  created: &serde_json::Value,
) {
  let Ok(conn) = crate::db::open_database_connection(app) else {
    return;
  };
  let _ = delete_persisted_queue_job(&conn, &job.id);
  let restored = PersistedQueueJob {
    id: new_id.to_string(),
    title: job.title.clone(),
    url: job.url.clone(),
    dest_path: job.dest_path.clone(),
    status: created
      .get("status")
      .and_then(|v| v.as_str())
      .unwrap_or("pending")
      .to_string(),
    priority: job.priority,
    progress: job.progress,
    bytes_downloaded: job.bytes_downloaded,
    total_bytes: job.total_bytes,
    error_msg: None,
    source_name: job.source_name.clone(),
  };
  let _ = upsert_persisted_queue_job(&conn, &restored);
  let _ = conn.execute(
    "UPDATE extraction_log SET job_id = ?1 WHERE job_id = ?2",
    rusqlite::params![new_id, job.id],
  );
}

pub(super) fn restored_identity_key(job: &PersistedQueueJob) -> String {
  job_identity_key(&job.url, &job.dest_path, &job.title)
}
