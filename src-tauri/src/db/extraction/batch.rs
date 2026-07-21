use rusqlite::Connection;
use std::collections::HashMap;

use super::log::ExtractionLogRow;

/// Uma query para vários jobs — substitui N+1 em `sidecar_list_jobs`.
pub fn batch_get_extraction_logs(
  conn: &Connection,
  job_ids: &[String],
) -> HashMap<String, ExtractionLogRow> {
  let mut out = HashMap::new();
  if job_ids.is_empty() {
    return out;
  }
  for chunk in job_ids.chunks(100) {
    let placeholders = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
      "SELECT job_id, status, extract_path, error FROM extraction_log WHERE job_id IN ({placeholders})"
    );
    let Ok(mut stmt) = conn.prepare(&sql) else {
      continue;
    };
    let params: Vec<&dyn rusqlite::ToSql> = chunk
      .iter()
      .map(|id| id as &dyn rusqlite::ToSql)
      .collect();
    let Ok(rows) = stmt.query_map(params.as_slice(), |row| {
      Ok((
        row.get::<_, String>(0)?,
        ExtractionLogRow {
          status: row.get(1)?,
          extract_path: row.get(2)?,
          error: row.get(3)?,
        },
      ))
    }) else {
      continue;
    };
    for row in rows.flatten() {
      out.insert(row.0, row.1);
    }
  }
  out
}
