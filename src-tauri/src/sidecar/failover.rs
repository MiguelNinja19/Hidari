//! Quando um download estagna, tenta outro magnet/URL do catálogo.

use crate::db::open_database_connection;
use crate::dto::HydraSourceDto;
use crate::queue::persist::{
  delete_persisted_queue_job, upsert_persisted_queue_job, PersistedQueueJob,
};
use crate::sidecar::engine::{ensure_sidecar_running, fetch_sidecar_job};
use crate::sources::enrich_magnet_url_with_title;
use crate::sources::hydra::list_hydra_sources;
use crate::sources::search_download_options_from_local_sources;
use crate::sources::validate_job_url;
use std::collections::HashSet;
use tauri::AppHandle;

fn magnet_infohash(url: &str) -> Option<String> {
  let lower = url.to_ascii_lowercase();
  let rest = lower.strip_prefix("magnet:?")?;
  for part in rest.split('&') {
    let part = part.strip_prefix("xt=")?;
    if let Some(hash) = part.strip_prefix("urn:btih:") {
      return Some(hash.to_string());
    }
  }
  None
}

fn url_fingerprint(url: &str) -> String {
  magnet_infohash(url).unwrap_or_else(|| url.trim().to_ascii_lowercase())
}

/// Cancela o job atual e enfileira uma fonte alternativa do catálogo.
pub async fn try_failover_stalled_job(app: AppHandle, job_id: String) -> Result<(), String> {
  let job = fetch_sidecar_job(&app, &job_id).await?;
  let title = job.title.clone();
  let dest_path = job.dest_path.clone();

  // URL atual (lista completa)
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
  let used = url_fingerprint(&current_url);

  let sources: Vec<HydraSourceDto> = {
    let conn = open_database_connection(&app)?;
    list_hydra_sources(&conn).unwrap_or_default()
  };
  if sources.is_empty() {
    return Err("no_sources_for_failover".into());
  }

  let options = search_download_options_from_local_sources(&app, &title, &sources).await;
  let mut seen = HashSet::new();
  seen.insert(used);

  let alternative = options.into_iter().find(|opt| {
    let fp = url_fingerprint(&opt.url);
    if seen.contains(&fp) {
      return false;
    }
    seen.insert(fp);
    validate_job_url(&opt.url).is_ok()
  });

  let Some(alt) = alternative else {
    return Err("no_alternate_source".into());
  };

  log::info!(
    "failover job={job_id} title={title} -> source={}",
    alt.source_name
  );

  // Remove job antigo
  let _ = client
    .delete(format!("http://127.0.0.1:{port}/jobs/{job_id}"))
    .send()
    .await;
  if let Ok(conn) = open_database_connection(&app) {
    let _ = delete_persisted_queue_job(&conn, &job_id);
  }

  let job_url = enrich_magnet_url_with_title(&alt.url, Some(&title));
  let seed_enabled = {
    let conn = open_database_connection(&app)?;
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
    if let Ok(conn) = open_database_connection(&app) {
      let persisted = PersistedQueueJob {
        id: new_id.to_string(),
        title: title.clone(),
        url: job_url,
        dest_path,
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
  } else {
    log::warn!("failover create missing id for {title}");
    return Err("failover_enqueue_failed".into());
  }

  Ok(())
}
