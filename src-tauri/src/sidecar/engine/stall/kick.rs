use super::super::jobs::fetch_sidecar_jobs_progress;
use super::super::port::ensure_sidecar_running;
use super::constants::STALL_KICK_PAUSE_MS;
use tokio::time::{sleep, Duration};

async fn post_job_action(
  client: &reqwest::Client,
  port: u16,
  id: &str,
  action: &str,
) -> Result<(), String> {
  let response = client
    .post(format!("http://127.0.0.1:{port}/jobs/{id}/{action}"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?;
  if response.status().is_success() {
    return Ok(());
  }
  let status = response.status();
  let body = response.text().await.unwrap_or_default();
  Err(format!("sidecar_{action}_failed: {status} {body}"))
}

pub(crate) async fn kick_stalled_job(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  post_job_action(&client, port, id, "pause").await?;
  // Give aria2 time to settle — a short delay often leaves the torrent stuck paused.
  sleep(Duration::from_millis(STALL_KICK_PAUSE_MS)).await;
  post_job_action(&client, port, id, "resume").await?;
  sleep(Duration::from_millis(700)).await;

  // If the poll raced and left the job paused, force another resume.
  if let Ok(rows) = fetch_sidecar_jobs_progress(app).await {
    let still_paused = rows
      .iter()
      .any(|row| row.id == id && row.status.eq_ignore_ascii_case("paused"));
    if still_paused {
      log::warn!("stall_kick_re_resume id={id} (still paused after kick)");
      post_job_action(&client, port, id, "resume").await?;
    }
  }
  Ok(())
}
