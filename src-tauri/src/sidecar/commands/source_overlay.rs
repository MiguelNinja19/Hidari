use rusqlite::{params, Connection};
use serde_json::Value;
use std::collections::HashMap;

fn collect_job_ids(value: &Value, ids: &mut Vec<String>) {
  match value {
    Value::Array(items) => {
      for item in items {
        collect_job_ids(item, ids);
      }
    }
    Value::Object(map) => {
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

fn load_source_names(conn: &Connection, ids: &[String]) -> HashMap<String, String> {
  let mut out = HashMap::new();
  let mut stmt = match conn.prepare(
    "SELECT source_name FROM persisted_queue_jobs \
     WHERE id = ?1 AND source_name IS NOT NULL AND TRIM(source_name) != ''",
  ) {
    Ok(stmt) => stmt,
    Err(_) => return out,
  };
  for id in ids {
    if let Ok(Some(name)) = stmt.query_row(params![id], |row| row.get::<_, String>(0)).optional() {
      out.insert(id.clone(), name);
    }
  }
  out
}

trait OptionalRow<T> {
  fn optional(self) -> Result<Option<T>, rusqlite::Error>;
}

impl<T> OptionalRow<T> for Result<T, rusqlite::Error> {
  fn optional(self) -> Result<Option<T>, rusqlite::Error> {
    match self {
      Ok(v) => Ok(Some(v)),
      Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
      Err(e) => Err(e),
    }
  }
}

fn overlay_items(items: &mut [Value], names: &HashMap<String, String>) {
  for item in items {
    if let Value::Object(job) = item {
      if let Some(name) = job
        .get("id")
        .and_then(|value| value.as_str())
        .and_then(|id| names.get(id))
      {
        if job
          .get("sourceName")
          .and_then(|v| v.as_str())
          .unwrap_or("")
          .is_empty()
        {
          job.insert("sourceName".to_string(), Value::String(name.clone()));
        }
      }
    }
  }
}

/// Injeta `sourceName` do SQLite na lista do sidecar (para aviso de senha).
pub fn enrich_jobs_with_source_name(value: &mut Value, conn: &Connection) {
  let _ = crate::queue::persist::ensure_persisted_queue_table(conn);
  let mut ids = Vec::new();
  collect_job_ids(value, &mut ids);
  ids.sort_unstable();
  ids.dedup();
  let names = load_source_names(conn, &ids);
  if names.is_empty() {
    return;
  }
  match value {
    Value::Array(items) => overlay_items(items, &names),
    Value::Object(map) => {
      for key in ["jobs", "data", "items"] {
        if let Some(items) = map.get_mut(key).and_then(|value| value.as_array_mut()) {
          overlay_items(items, &names);
          break;
        }
      }
    }
    _ => {}
  }
}
