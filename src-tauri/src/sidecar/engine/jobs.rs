use crate::dto::{SidecarJobForLaunch, SidecarJobProgressRow};
use tauri::AppHandle;

use super::port::ensure_sidecar_running;

pub async fn fetch_sidecar_job(app: &AppHandle, id: &str) -> Result<SidecarJobForLaunch, String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  client
    .get(format!("http://127.0.0.1:{port}/jobs/{id}"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .error_for_status()
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<SidecarJobForLaunch>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))
}

pub async fn fetch_sidecar_jobs_progress(
  app: &AppHandle,
) -> Result<Vec<SidecarJobProgressRow>, String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let value = client
    .get(format!("http://127.0.0.1:{port}/jobs"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))?;

  let rows = match value {
    serde_json::Value::Array(items) => items,
    serde_json::Value::Object(map) => map
      .get("jobs")
      .or_else(|| map.get("data"))
      .and_then(|v| v.as_array())
      .cloned()
      .unwrap_or_default(),
    _ => Vec::new(),
  };

  Ok(rows
    .into_iter()
    .filter_map(|row| serde_json::from_value::<SidecarJobProgressRow>(row).ok())
    .collect())
}
