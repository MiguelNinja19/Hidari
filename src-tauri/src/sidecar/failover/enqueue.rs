use crate::db::open_database_connection;
use crate::queue::persist::{upsert_persisted_queue_job, PersistedQueueJob};
use crate::sources::enrich_magnet_url_with_title;
use tauri::AppHandle;

use super::alternatives::FailoverAlternative;

pub(crate) async fn enqueue_replacement(
  app: &AppHandle,
  client: &reqwest::Client,
  port: u16,
  title: &str,
  dest_path: &str,
  alt: &FailoverAlternative,
) -> Result<(), String> {
  let job_url = enrich_magnet_url_with_title(&alt.url, Some(title));
  let seed_enabled = {
    let conn = open_database_connection(app)?;
    conn
      .query_row(
        "SELECT value FROM app_settings WHERE key = 'seed_torrents_enabled'",
        [],
        |row| row.get::<_, String>(0),
      )
      .ok()
      .map(|value| !matches!(value.as_str(), "0" | "false" | "FALSE"))
      .unwrap_or(true)
  };

  let body = serde_json::json!({
    "title": title,
    "url": job_url,
    "destPath": dest_path,
    "priority": 0,
    "seedEnabled": seed_enabled,
  });

  let created = client
    .post(format!("http://127.0.0.1:{port}/jobs"))
    .json(&body)
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))?;

  if let Some(new_id) = created.get("id").and_then(|v| v.as_str()) {
    if let Ok(conn) = open_database_connection(app) {
      let persisted = PersistedQueueJob {
        id: new_id.to_string(),
        title: title.to_string(),
        url: job_url,
        dest_path: dest_path.to_string(),
        status: "downloading".into(),
        priority: 0,
        progress: 0,
        bytes_downloaded: 0,
        total_bytes: 0,
        error_msg: Some(format!(
          "download_failover: A tentar outra fonte ({})",
          alt.source_name
        )),
      };
      let _ = upsert_persisted_queue_job(&conn, &persisted);
    }
    log::info!("failover enqueued new job {new_id} for {title}");
    Ok(())
  } else {
    log::warn!("failover create missing id for {title}");
    Err("failover_enqueue_failed".into())
  }
}
