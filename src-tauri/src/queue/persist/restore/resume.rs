use super::super::transfer::is_fully_transferred_job;

pub(super) async fn resume_paused_sidecar_jobs(client: &reqwest::Client, port: u16) {
  let Ok(response) = client
    .get(format!("http://127.0.0.1:{port}/jobs"))
    .send()
    .await
  else {
    return;
  };
  let Ok(value) = response.json::<serde_json::Value>().await else {
    return;
  };
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

  for row in rows {
    let status = row.get("status").and_then(|v| v.as_str()).unwrap_or("");
    if status != "paused" {
      continue;
    }
    let done = row
      .get("bytesDownloaded")
      .or_else(|| row.get("bytes_downloaded"))
      .and_then(|v| v.as_i64())
      .unwrap_or(0);
    let total = row
      .get("totalBytes")
      .or_else(|| row.get("total_bytes"))
      .and_then(|v| v.as_i64())
      .unwrap_or(0);
    if is_fully_transferred_job(done, total) {
      continue;
    }
    let Some(id) = row.get("id").and_then(|v| v.as_str()) else {
      continue;
    };
    match client
      .post(format!("http://127.0.0.1:{port}/jobs/{id}/resume"))
      .send()
      .await
    {
      Ok(resp) if resp.status().is_success() => {
        log::info!("auto-resumed paused job on startup id={id}");
      }
      Ok(resp) => {
        log::warn!(
          "auto-resume failed id={id}: {}",
          resp.status()
        );
      }
      Err(error) => log::warn!("auto-resume failed id={id}: {error}"),
    }
  }
}
