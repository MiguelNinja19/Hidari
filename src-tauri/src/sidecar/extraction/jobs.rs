use crate::config::MIN_DOWNLOAD_VERIFY_BYTES;
use crate::dto::SidecarJobWatcher;
use tauri::AppHandle;

pub async fn list_sidecar_jobs_for_watcher(
  app: &AppHandle,
) -> Result<Vec<SidecarJobWatcher>, String> {
  let port = super::super::engine::ensure_sidecar_running(app.clone()).await?;
  let value = reqwest::Client::new()
    .get(format!("http://127.0.0.1:{port}/jobs"))
    .send()
    .await
    .map_err(|error| format!("sidecar_request_failed: {error}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|error| format!("sidecar_parse_failed: {error}"))?;
  let rows = match value {
    serde_json::Value::Array(items) => items,
    serde_json::Value::Object(map) => map
      .get("jobs")
      .or_else(|| map.get("data"))
      .and_then(|value| value.as_array())
      .cloned()
      .unwrap_or_default(),
    _ => Vec::new(),
  };
  Ok(rows
    .into_iter()
    .filter_map(|row| serde_json::from_value(row).ok())
    .collect())
}

pub(crate) fn job_reported_metadata_only(job: &SidecarJobWatcher) -> bool {
  let reported = job.total_bytes.max(job.bytes_downloaded);
  reported > 0 && (reported as u64) < MIN_DOWNLOAD_VERIFY_BYTES
}

pub(crate) fn dest_has_game_content(title: &str, dest_path: &str) -> bool {
  let content = crate::launch::resolve_game_content_root(title, dest_path);
  let content_str = content.to_string_lossy();
  if crate::launch::find_setup_executable(title, content_str.as_ref()).is_some()
    || crate::launch::job_has_playable_executable(title, content_str.as_ref())
  {
    return true;
  }
  if let Some(archive) = crate::archive::find_job_archive(content_str.as_ref()) {
    if std::fs::metadata(archive).map(|meta| meta.len()).unwrap_or(0)
      >= MIN_DOWNLOAD_VERIFY_BYTES
    {
      return true;
    }
  }
  let Some(payload) = crate::archive::find_download_payload(content_str.as_ref()) else {
    return false;
  };
  if payload
    .extension()
    .and_then(|extension| extension.to_str())
    .is_some_and(|extension| extension.eq_ignore_ascii_case("torrent"))
  {
    return false;
  }
  std::fs::metadata(payload).map(|meta| meta.len()).unwrap_or(0)
    >= MIN_DOWNLOAD_VERIFY_BYTES
}

pub(crate) async fn dest_has_game_content_async(title: String, dest_path: String) -> bool {
  tauri::async_runtime::spawn_blocking(move || dest_has_game_content(&title, &dest_path))
    .await
    .unwrap_or(false)
}

