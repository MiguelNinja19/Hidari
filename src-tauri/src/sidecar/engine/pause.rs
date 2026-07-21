use tauri::AppHandle;

use super::port::ensure_sidecar_running;

pub async fn pause_all_active_sidecar_jobs(app: AppHandle) -> Result<(), String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let jobs = client
    .get(format!("http://127.0.0.1:{port}/jobs"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))?;

  let Some(job_list) = jobs.as_array() else {
    return Ok(());
  };

  let mut last_error: Option<String> = None;

  for job in job_list {
    let Some(status) = job.get("status").and_then(|value| value.as_str()) else {
      continue;
    };

    if status != "downloading" && status != "pending" && status != "seeding" && status != "retrying"
    {
      continue;
    }

    let Some(id) = job.get("id").and_then(|value| value.as_str()) else {
      continue;
    };

    match client
      .post(format!("http://127.0.0.1:{port}/jobs/{id}/pause"))
      .send()
      .await
    {
      Ok(response) if response.status().is_success() => {}
      Ok(response) => {
        let status_code = response.status();
        let body = response.text().await.unwrap_or_default();
        last_error = Some(format!("sidecar_pause_failed: {status_code} {body}"));
        log::warn!("pause_job_failed id={id}: {status_code}");
      }
      Err(error) => {
        last_error = Some(format!("sidecar_request_failed: {error}"));
        log::warn!("pause_job_failed id={id}: {error}");
      }
    }
  }

  if let Some(error) = last_error {
    return Err(error);
  }

  Ok(())
}
