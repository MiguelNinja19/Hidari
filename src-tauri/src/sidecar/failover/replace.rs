use crate::sidecar::engine::{ensure_sidecar_running, fetch_sidecar_job};
use tauri::AppHandle;

use super::alternatives::find_failover_alternative;
use super::enqueue::enqueue_replacement;
use super::remove::remove_old_job;

/// Cancela o job atual e enfileira uma fonte alternativa do catálogo.
pub async fn try_failover_stalled_job(app: AppHandle, job_id: String) -> Result<(), String> {
  let job = fetch_sidecar_job(&app, &job_id).await?;
  let title = job.title.clone();
  let dest_path = job.dest_path.clone();

  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let current = client
    .get(format!("http://127.0.0.1:{port}/jobs/{job_id}"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))?;
  let current_url = current
    .get("url")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_string();

  let alt = find_failover_alternative(&app, &title, &current_url).await?;
  log::info!(
    "failover job={job_id} title={title} -> source={}",
    alt.source_name
  );

  remove_old_job(&app, &client, port, &job_id).await?;
  enqueue_replacement(&app, &client, port, &title, &dest_path, &alt).await
}
