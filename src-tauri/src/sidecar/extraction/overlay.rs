use crate::db::{batch_get_extraction_logs, ExtractionLogRow};
use rusqlite::Connection;
use std::collections::HashMap;

pub fn apply_extraction_overlay(
  job: &mut serde_json::Map<String, serde_json::Value>,
  row: &ExtractionLogRow,
) {
  job.insert(
    "extractionStatus".to_string(),
    serde_json::Value::String(row.status.clone()),
  );
  if matches!(row.status.as_str(), "extracting" | "extracted") {
    job.insert("status".to_string(), serde_json::Value::String(row.status.clone()));
  }
  // failed de extract: só extractionStatus — mantém completed/seeding na biblioteca.
  if let Some(path) = &row.extract_path {
    job.insert("extractPath".to_string(), serde_json::Value::String(path.clone()));
  }
  if let Some(message) = &row.error {
    job.insert("errorMsg".to_string(), serde_json::Value::String(message.clone()));
  }
}

fn collect_job_ids(value: &serde_json::Value, ids: &mut Vec<String>) {
  match value {
    serde_json::Value::Array(items) => {
      for item in items {
        collect_job_ids(item, ids);
      }
    }
    serde_json::Value::Object(map) => {
      if let Some(id) = map.get("id").and_then(|value| value.as_str()) {
        ids.push(id.to_string());
      }
      if let Some(nested) = ["jobs", "data", "items"].iter().find_map(|key| map.get(*key)) {
        collect_job_ids(nested, ids);
      }
    }
    _ => {}
  }
}

fn overlay_items(items: &mut [serde_json::Value], rows: &HashMap<String, ExtractionLogRow>) {
  for item in items {
    if let serde_json::Value::Object(job) = item {
      if let Some(row) = job
        .get("id")
        .and_then(|value| value.as_str())
        .and_then(|id| rows.get(id))
      {
        apply_extraction_overlay(job, row);
      }
    }
  }
}

fn apply_overlays(value: &mut serde_json::Value, rows: &HashMap<String, ExtractionLogRow>) {
  match value {
    serde_json::Value::Array(items) => overlay_items(items, rows),
    serde_json::Value::Object(map) => {
      for key in ["jobs", "data", "items"] {
        if let Some(items) = map.get_mut(key).and_then(|value| value.as_array_mut()) {
          overlay_items(items, rows);
          break;
        }
      }
    }
    _ => {}
  }
}

pub fn enrich_jobs_with_extraction(value: &mut serde_json::Value, conn: &Connection) {
  let mut ids = Vec::new();
  collect_job_ids(value, &mut ids);
  ids.sort_unstable();
  ids.dedup();
  if !ids.is_empty() {
    apply_overlays(value, &batch_get_extraction_logs(conn, &ids));
  }
}
