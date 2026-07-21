use crate::queue::persist::{list_history_persisted_jobs, PersistedQueueJob};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::collections::HashSet;

fn job_identity(url: &str, dest: &str, title: &str) -> String {
  format!(
    "{}|{}|{}",
    url.trim().to_ascii_lowercase(),
    dest.trim().to_ascii_lowercase(),
    title.trim().to_ascii_lowercase()
  )
}

fn collect_live_keys(items: &[Value]) -> (HashSet<String>, HashSet<String>) {
  let mut ids = HashSet::new();
  let mut identities = HashSet::new();
  for item in items {
    let Some(map) = item.as_object() else {
      continue;
    };
    if let Some(id) = map.get("id").and_then(|v| v.as_str()) {
      ids.insert(id.to_string());
    }
    let url = map.get("url").and_then(|v| v.as_str()).unwrap_or("");
    let dest = map
      .get("destPath")
      .or_else(|| map.get("dest_path"))
      .and_then(|v| v.as_str())
      .unwrap_or("");
    let title = map.get("title").and_then(|v| v.as_str()).unwrap_or("");
    identities.insert(job_identity(url, dest, title));
  }
  (ids, identities)
}

fn history_to_json(job: &PersistedQueueJob) -> Value {
  let progress = if job.total_bytes > 0 && job.bytes_downloaded >= job.total_bytes {
    100_i64
  } else {
    job.progress.clamp(0, 100)
  };
  json!({
    "id": job.id,
    "title": job.title,
    "url": job.url,
    "destPath": job.dest_path,
    "status": job.status,
    "priority": job.priority,
    "progress": progress,
    "bytesDownloaded": job.bytes_downloaded,
    "totalBytes": job.total_bytes,
    "speedBps": 0,
    "etaSeconds": -1,
    "errorMsg": job.error_msg,
    "sourceName": job.source_name,
  })
}

/// Junta downloads concluídos do SQLite à lista em memória do sidecar.
pub fn merge_persisted_history(value: &mut Value, conn: &Connection) {
  let Ok(history) = list_history_persisted_jobs(conn) else {
    return;
  };
  if history.is_empty() {
    return;
  }

  let items = match value {
    Value::Array(items) => items,
    Value::Object(map) => {
      let key = ["jobs", "data", "items"]
        .into_iter()
        .find(|k| map.get(*k).and_then(|v| v.as_array()).is_some());
      match key {
        Some(k) => match map.get_mut(k).and_then(|v| v.as_array_mut()) {
          Some(items) => items,
          None => return,
        },
        None => return,
      }
    }
    _ => return,
  };

  let (live_ids, live_identities) = collect_live_keys(items);
  for job in history {
    if live_ids.contains(&job.id) {
      continue;
    }
    let key = job_identity(&job.url, &job.dest_path, &job.title);
    if live_identities.contains(&key) {
      continue;
    }
    items.push(history_to_json(&job));
  }
}
