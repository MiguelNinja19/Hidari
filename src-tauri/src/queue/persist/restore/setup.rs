use crate::db::open_database_connection;
use crate::sidecar::ensure_sidecar_running;
use tauri::AppHandle;

use super::super::list::list_resumable_persisted_jobs;
use super::super::types::{PersistedQueueJob, RestoredSidecarJob};

pub(super) async fn load_restore_context(
  app: AppHandle,
) -> Option<(u16, reqwest::Client, Vec<PersistedQueueJob>, std::collections::HashSet<String>)> {
  let Ok(port) = ensure_sidecar_running(app.clone()).await else {
    log::warn!("restore_persisted_queue_jobs: sidecar unavailable");
    return None;
  };

  let persisted = match open_database_connection(&app) {
    Ok(conn) => match list_resumable_persisted_jobs(&conn) {
      Ok(items) => items,
      Err(error) => {
        log::warn!("restore_persisted_queue_jobs: list failed: {error}");
        return None;
      }
    },
    Err(error) => {
      log::warn!("restore_persisted_queue_jobs: db failed: {error}");
      return None;
    }
  };

  if persisted.is_empty() {
    return None;
  }

  let client = reqwest::Client::new();
  let live_value = match client
    .get(format!("http://127.0.0.1:{port}/jobs"))
    .send()
    .await
  {
    Ok(response) => response.json::<serde_json::Value>().await.unwrap_or_default(),
    Err(error) => {
      log::warn!("restore_persisted_queue_jobs: list live failed: {error}");
      return None;
    }
  };

  let live_rows = match live_value {
    serde_json::Value::Array(items) => items,
    serde_json::Value::Object(map) => map
      .get("jobs")
      .or_else(|| map.get("data"))
      .and_then(|v| v.as_array())
      .cloned()
      .unwrap_or_default(),
    _ => Vec::new(),
  };

  let mut live_keys = std::collections::HashSet::new();
  for row in &live_rows {
    if let Ok(job) = serde_json::from_value::<RestoredSidecarJob>(row.clone()) {
      live_keys.insert(job.identity_key());
    }
  }

  Some((port, client, persisted, live_keys))
}
