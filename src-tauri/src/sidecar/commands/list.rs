use super::super::engine::ensure_sidecar_running;
use super::super::extraction::enrich_jobs_with_extraction;
use super::merge_history::merge_persisted_history;
use super::source_overlay::enrich_jobs_with_source_name;
use crate::db::open_database_connection;
use tauri::AppHandle;

#[tauri::command]
pub async fn sidecar_list_jobs(app: AppHandle) -> Result<serde_json::Value, String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let mut value = client
    .get(format!("http://127.0.0.1:{port}/jobs"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))?;

  if let Ok(conn) = open_database_connection(&app) {
    merge_persisted_history(&mut value, &conn);
    enrich_jobs_with_source_name(&mut value, &conn);
    enrich_jobs_with_extraction(&mut value, &conn);
  }

  Ok(value)
}
