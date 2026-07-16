use crate::db::open_database_connection;
use crate::sidecar::ensure_sidecar_running;
use rusqlite::{params, Connection};
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Clone)]
pub struct PersistedQueueJob {
  pub id: String,
  pub title: String,
  pub url: String,
  pub dest_path: String,
  pub status: String,
  pub priority: i32,
  pub progress: i64,
  pub bytes_downloaded: i64,
  pub total_bytes: i64,
  pub error_msg: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RestoredSidecarJob {
  #[allow(dead_code)]
  id: String,
  #[serde(default)]
  title: String,
  #[serde(default)]
  url: String,
  #[serde(default, alias = "destPath")]
  dest_path: String,
  #[allow(dead_code)]
  #[serde(default)]
  status: String,
}

pub fn ensure_persisted_queue_table(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      "CREATE TABLE IF NOT EXISTS persisted_queue_jobs (
         id TEXT PRIMARY KEY NOT NULL,
         title TEXT NOT NULL,
         url TEXT NOT NULL,
         dest_path TEXT NOT NULL,
         status TEXT NOT NULL,
         priority INTEGER NOT NULL DEFAULT 0,
         progress INTEGER NOT NULL DEFAULT 0,
         bytes_downloaded INTEGER NOT NULL DEFAULT 0,
         total_bytes INTEGER NOT NULL DEFAULT 0,
         error_msg TEXT,
         updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
       );
       CREATE INDEX IF NOT EXISTS idx_persisted_queue_status
         ON persisted_queue_jobs(status);",
    )
    .map_err(|e| format!("could_not_create_persisted_queue_jobs: {e}"))
}

pub fn upsert_persisted_queue_job(
  conn: &Connection,
  job: &PersistedQueueJob,
) -> Result<(), String> {
  ensure_persisted_queue_table(conn)?;
  conn
    .execute(
      "INSERT INTO persisted_queue_jobs \
         (id, title, url, dest_path, status, priority, progress, bytes_downloaded, total_bytes, error_msg, updated_at) \
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, CURRENT_TIMESTAMP) \
       ON CONFLICT(id) DO UPDATE SET \
         title = excluded.title, \
         url = excluded.url, \
         dest_path = excluded.dest_path, \
         status = excluded.status, \
         priority = excluded.priority, \
         progress = excluded.progress, \
         bytes_downloaded = excluded.bytes_downloaded, \
         total_bytes = excluded.total_bytes, \
         error_msg = excluded.error_msg, \
         updated_at = CURRENT_TIMESTAMP",
      params![
        job.id,
        job.title,
        job.url,
        job.dest_path,
        job.status,
        job.priority,
        job.progress,
        job.bytes_downloaded,
        job.total_bytes,
        job.error_msg,
      ],
    )
    .map_err(|e| format!("could_not_upsert_persisted_queue_job: {e}"))?;
  Ok(())
}

pub fn update_persisted_queue_status(
  conn: &Connection,
  id: &str,
  status: &str,
  error_msg: Option<&str>,
) -> Result<(), String> {
  ensure_persisted_queue_table(conn)?;
  conn
    .execute(
      "UPDATE persisted_queue_jobs \
       SET status = ?1, \
           error_msg = COALESCE(?2, error_msg), \
           updated_at = CURRENT_TIMESTAMP \
       WHERE id = ?3",
      params![status, error_msg, id],
    )
    .map_err(|e| format!("could_not_update_persisted_queue_status: {e}"))?;
  Ok(())
}

pub fn update_persisted_queue_progress(
  conn: &Connection,
  id: &str,
  status: &str,
  progress: i64,
  bytes_downloaded: i64,
  total_bytes: i64,
  error_msg: Option<&str>,
) -> Result<(), String> {
  ensure_persisted_queue_table(conn)?;
  conn
    .execute(
      "UPDATE persisted_queue_jobs \
       SET status = ?1, \
           progress = ?2, \
           bytes_downloaded = ?3, \
           total_bytes = ?4, \
           error_msg = COALESCE(?5, error_msg), \
           updated_at = CURRENT_TIMESTAMP \
       WHERE id = ?6",
      params![status, progress, bytes_downloaded, total_bytes, error_msg, id],
    )
    .map_err(|e| format!("could_not_update_persisted_queue_progress: {e}"))?;
  Ok(())
}

pub fn delete_persisted_queue_job(conn: &Connection, id: &str) -> Result<(), String> {
  ensure_persisted_queue_table(conn)?;
  conn
    .execute("DELETE FROM persisted_queue_jobs WHERE id = ?1", params![id])
    .map_err(|e| format!("could_not_delete_persisted_queue_job: {e}"))?;
  Ok(())
}

pub fn mark_active_persisted_jobs_paused(conn: &Connection) -> Result<(), String> {
  ensure_persisted_queue_table(conn)?;
  // Downloads já a 100%: fecham como completed — senão no próximo arranque
  // o restore recria o magnet e parece “baixar de novo”.
  let _ = finalize_fully_transferred_persisted_jobs(conn);
  conn
    .execute(
      "UPDATE persisted_queue_jobs \
       SET status = 'paused', updated_at = CURRENT_TIMESTAMP \
       WHERE status IN ('downloading', 'pending', 'retrying')",
      [],
    )
    .map_err(|e| format!("could_not_mark_persisted_jobs_paused: {e}"))?;
  Ok(())
}

fn is_fully_transferred(bytes_downloaded: i64, total_bytes: i64) -> bool {
  const MIN_CONTENT_BYTES: i64 = 5 * 1024 * 1024;
  // Estrito: só “não restaurar” quando os bytes batem certo.
  // O 0.995 da UI é outra história (barra/%); aqui um falso positivo
  // deixaria um download a meio sem retomar.
  total_bytes >= MIN_CONTENT_BYTES
    && bytes_downloaded >= MIN_CONTENT_BYTES
    && bytes_downloaded >= total_bytes
}

pub fn is_fully_transferred_bytes(bytes_downloaded: i64, total_bytes: i64) -> bool {
  is_fully_transferred(bytes_downloaded, total_bytes)
}

/// Jobs com transferência real concluída deixam de ser “resumíveis”.
pub fn finalize_fully_transferred_persisted_jobs(conn: &Connection) -> Result<usize, String> {
  ensure_persisted_queue_table(conn)?;
  let changed = conn
    .execute(
      "UPDATE persisted_queue_jobs \
       SET status = 'completed', updated_at = CURRENT_TIMESTAMP \
       WHERE status IN ('paused', 'pending', 'downloading', 'retrying', 'seeding') \
         AND total_bytes >= 5242880 \
         AND bytes_downloaded >= 5242880 \
         AND bytes_downloaded >= total_bytes",
      [],
    )
    .map_err(|e| format!("could_not_finalize_persisted_jobs: {e}"))?;
  Ok(changed)
}

fn is_resumable_status(status: &str) -> bool {
  matches!(
    status,
    "paused" | "pending" | "downloading" | "retrying" | "seeding"
  )
}

pub fn list_resumable_persisted_jobs(conn: &Connection) -> Result<Vec<PersistedQueueJob>, String> {
  ensure_persisted_queue_table(conn)?;
  let _ = finalize_fully_transferred_persisted_jobs(conn);
  let mut stmt = conn
    .prepare(
      "SELECT id, title, url, dest_path, status, priority, progress, bytes_downloaded, total_bytes, error_msg \
       FROM persisted_queue_jobs \
       WHERE status IN ('paused', 'pending', 'downloading', 'retrying', 'seeding') \
       ORDER BY updated_at ASC",
    )
    .map_err(|e| format!("could_not_prepare_persisted_queue_list: {e}"))?;

  let rows = stmt
    .query_map([], |row| {
      Ok(PersistedQueueJob {
        id: row.get(0)?,
        title: row.get(1)?,
        url: row.get(2)?,
        dest_path: row.get(3)?,
        status: row.get(4)?,
        priority: row.get(5)?,
        progress: row.get(6)?,
        bytes_downloaded: row.get(7)?,
        total_bytes: row.get(8)?,
        error_msg: row.get(9)?,
      })
    })
    .map_err(|e| format!("could_not_query_persisted_queue: {e}"))?;

  Ok(
    rows
      .filter_map(Result::ok)
      .filter(|job| !is_fully_transferred(job.bytes_downloaded, job.total_bytes))
      .collect(),
  )
}

fn job_identity_key(url: &str, dest_path: &str, title: &str) -> String {
  format!(
    "{}|{}|{}",
    url.trim().to_ascii_lowercase(),
    dest_path.trim().to_ascii_lowercase(),
    title.trim().to_ascii_lowercase()
  )
}

/// Rehydrate sidecar queue from SQLite after engine restart (keeps .aria2 / partial files).
pub async fn restore_persisted_queue_jobs(app: AppHandle) {
  let Ok(port) = ensure_sidecar_running(app.clone()).await else {
    log::warn!("restore_persisted_queue_jobs: sidecar unavailable");
    return;
  };

  let persisted = match open_database_connection(&app) {
    Ok(conn) => match list_resumable_persisted_jobs(&conn) {
      Ok(items) => items,
      Err(error) => {
        log::warn!("restore_persisted_queue_jobs: list failed: {error}");
        return;
      }
    },
    Err(error) => {
      log::warn!("restore_persisted_queue_jobs: db failed: {error}");
      return;
    }
  };

  if persisted.is_empty() {
    return;
  }

  let client = reqwest::Client::new();
  let live_value = match client
    .get(format!("http://127.0.0.1:{port}/jobs"))
    .send()
    .await
  {
    Ok(response) => response.json::<serde_json::Value>().await.unwrap_or_default(),
    Err(error) => {
      log::warn!("restore_persisted_queue_jobs: list live failed: {error}");
      return;
    }
  };

  let live_rows = match live_value {
    serde_json::Value::Array(items) => items,
    serde_json::Value::Object(map) => map
      .get("jobs")
      .or_else(|| map.get("data"))
      .and_then(|v| v.as_array())
      .cloned()
      .unwrap_or_default(),
    _ => Vec::new(),
  };

  let mut live_keys = std::collections::HashSet::new();
  for row in &live_rows {
    if let Ok(job) = serde_json::from_value::<RestoredSidecarJob>(row.clone()) {
      live_keys.insert(job_identity_key(&job.url, &job.dest_path, &job.title));
    }
  }

  for job in persisted {
    if !is_resumable_status(&job.status) || job.url.trim().is_empty() {
      continue;
    }
    // Já baixado de verdade → Biblioteca; não recriar no motor.
    if is_fully_transferred(job.bytes_downloaded, job.total_bytes) {
      if let Ok(conn) = open_database_connection(&app) {
        let _ = update_persisted_queue_status(&conn, &job.id, "completed", None);
      }
      log::info!(
        "skip restore of finished job '{}' ({} / {} bytes)",
        job.title,
        job.bytes_downloaded,
        job.total_bytes
      );
      continue;
    }
    let key = job_identity_key(&job.url, &job.dest_path, &job.title);
    if live_keys.contains(&key) {
      continue;
    }

    let body = serde_json::json!({
      "title": job.title,
      "url": job.url,
      "destPath": job.dest_path,
      "priority": job.priority,
    });

    let created = match client
      .post(format!("http://127.0.0.1:{port}/jobs"))
      .json(&body)
      .send()
      .await
    {
      Ok(response) => match response.json::<serde_json::Value>().await {
        Ok(value) => value,
        Err(error) => {
          log::warn!("restore_persisted_queue_jobs: parse create failed id={}: {error}", job.id);
          continue;
        }
      },
      Err(error) => {
        log::warn!("restore_persisted_queue_jobs: create failed id={}: {error}", job.id);
        continue;
      }
    };

    let Some(new_id) = created.get("id").and_then(|v| v.as_str()).map(str::to_string) else {
      log::warn!("restore_persisted_queue_jobs: missing id for {}", job.id);
      continue;
    };

    // Não voltar a pausar no restore: ao reabrir a app os downloads devem continuar.
    if let Ok(conn) = open_database_connection(&app) {
      let _ = delete_persisted_queue_job(&conn, &job.id);
      let restored = PersistedQueueJob {
        id: new_id.clone(),
        title: job.title.clone(),
        url: job.url.clone(),
        dest_path: job.dest_path.clone(),
        status: created
          .get("status")
          .and_then(|v| v.as_str())
          .unwrap_or("pending")
          .to_string(),
        priority: job.priority,
        progress: job.progress,
        bytes_downloaded: job.bytes_downloaded,
        total_bytes: job.total_bytes,
        error_msg: None,
      };
      let _ = upsert_persisted_queue_job(&conn, &restored);

      // Keep extraction_log linked if the old id existed.
      let _ = conn.execute(
        "UPDATE extraction_log SET job_id = ?1 WHERE job_id = ?2",
        params![new_id, job.id],
      );
    }

    live_keys.insert(key);
    log::info!(
      "restored queue job '{}' as {} (was {})",
      job.title,
      new_id,
      job.status
    );
  }

  // Jobs que já estavam no sidecar como paused (fecho da app) → retomar.
  resume_paused_sidecar_jobs(&client, port).await;
}

async fn resume_paused_sidecar_jobs(client: &reqwest::Client, port: u16) {
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
    if is_fully_transferred(done, total) {
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

#[cfg(test)]
mod tests {
  use super::{finalize_fully_transferred_persisted_jobs, is_fully_transferred_bytes};
  use rusqlite::Connection;

  #[test]
  fn fully_transferred_requires_exact_bytes_and_min_size() {
    let big = 618_035_125_i64;
    assert!(is_fully_transferred_bytes(big, big));
    assert!(!is_fully_transferred_bytes(big - 1, big));
    // 99.6% ainda incompleto — não finaliza
    assert!(!is_fully_transferred_bytes(((big as f64) * 0.996) as i64, big));
    // Metadados pequeninos nunca contam
    assert!(!is_fully_transferred_bytes(32_708, 32_708));
    assert!(!is_fully_transferred_bytes(0, 0));
  }

  #[test]
  fn finalize_marks_complete_seeding_but_keeps_incomplete() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
      "CREATE TABLE persisted_queue_jobs (
         id TEXT PRIMARY KEY NOT NULL,
         title TEXT NOT NULL,
         url TEXT NOT NULL,
         dest_path TEXT NOT NULL,
         status TEXT NOT NULL,
         priority INTEGER NOT NULL DEFAULT 0,
         progress INTEGER NOT NULL DEFAULT 0,
         bytes_downloaded INTEGER NOT NULL DEFAULT 0,
         total_bytes INTEGER NOT NULL DEFAULT 0,
         error_msg TEXT,
         updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
       );",
    )
    .unwrap();

    conn.execute(
      "INSERT INTO persisted_queue_jobs \
         (id, title, url, dest_path, status, progress, bytes_downloaded, total_bytes) \
       VALUES \
         ('done', 'Terraria', 'magnet:?x', 'J:\\\\dddd', 'seeding', 100, 618035125, 618035125), \
         ('mid', 'Half', 'magnet:?y', 'J:\\\\dddd', 'paused', 50, 300000000, 618035125), \
         ('tiny', 'Meta', 'magnet:?z', 'J:\\\\dddd', 'seeding', 100, 32708, 32708)",
      [],
    )
    .unwrap();

    let n = finalize_fully_transferred_persisted_jobs(&conn).unwrap();
    assert_eq!(n, 1);

    let done_status: String = conn
      .query_row(
        "SELECT status FROM persisted_queue_jobs WHERE id='done'",
        [],
        |r| r.get(0),
      )
      .unwrap();
    let mid_status: String = conn
      .query_row(
        "SELECT status FROM persisted_queue_jobs WHERE id='mid'",
        [],
        |r| r.get(0),
      )
      .unwrap();
    let tiny_status: String = conn
      .query_row(
        "SELECT status FROM persisted_queue_jobs WHERE id='tiny'",
        [],
        |r| r.get(0),
      )
      .unwrap();

    assert_eq!(done_status, "completed");
    assert_eq!(mid_status, "paused");
    assert_eq!(tiny_status, "seeding");
  }
}
