use crate::db::{fetch_job_by_id, get_extraction_status, map_job_row, open_database_connection};
use crate::dto::{
  DownloadJobDto, EnqueueJobPayload, JobIdPayload, JobProgressEvent, QUEUE_EVENT_JOB_PROGRESS,
};
use crate::dto::SidecarJobWatcher;
use crate::sidecar::ensure_sidecar_running;
use crate::sources::validate_job_url;
use crate::state::QueueManager;
use rusqlite::params;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::time::{sleep, Duration};

#[tauri::command]
pub fn enqueue_job(app: AppHandle, payload: EnqueueJobPayload) -> Result<DownloadJobDto, String> {
  validate_job_url(&payload.url)?;
  let conn = open_database_connection(&app)?;
  let priority = payload.priority.unwrap_or(0);
  conn
    .execute(
      "INSERT INTO download_jobs (title, url, dest_path, priority) VALUES (?1, ?2, ?3, ?4)",
      params![payload.title, payload.url, payload.dest_path, priority],
    )
    .map_err(|e| format!("could_not_enqueue_job: {e}"))?;
  let job_id = conn.last_insert_rowid();
  let job = fetch_job_by_id(&conn, job_id)?;
  drop(conn);

  let app_clone = app.clone();
  let queue: tauri::State<'_, QueueManager> = app_clone.state();
  maybe_start_next_job(
    app,
    queue.active_job_id.clone(),
    queue.should_cancel.clone(),
    queue.should_pause.clone(),
  );
  Ok(job)
}

#[tauri::command]
pub fn list_jobs(app: AppHandle) -> Result<Vec<DownloadJobDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare(
      "SELECT id, title, url, dest_path, status, priority, progress, \
       bytes_downloaded, total_bytes, error_msg, created_at, updated_at \
       FROM download_jobs ORDER BY priority DESC, id ASC",
    )
    .map_err(|e| format!("could_not_prepare_list_jobs: {e}"))?;
  let result = stmt
    .query_map([], map_job_row)
    .map_err(|e| format!("could_not_query_jobs: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_jobs: {e}"));
  result
}

#[tauri::command]
pub fn cancel_job(app: AppHandle, payload: JobIdPayload) -> Result<(), String> {
  let queue: tauri::State<'_, QueueManager> = app.state();
  let is_active = *queue.active_job_id.lock().unwrap() == Some(payload.id);
  if is_active {
    *queue.should_cancel.lock().unwrap() = true;
  } else {
    let conn = open_database_connection(&app)?;
    conn
      .execute(
        "UPDATE download_jobs SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?1 AND status IN ('pending', 'paused')",
        params![payload.id],
      )
      .map_err(|e| format!("could_not_cancel_job: {e}"))?;
  }
  Ok(())
}

#[tauri::command]
pub fn pause_job(app: AppHandle, payload: JobIdPayload) -> Result<(), String> {
  let queue: tauri::State<'_, QueueManager> = app.state();
  let is_active = *queue.active_job_id.lock().unwrap() == Some(payload.id);
  if is_active {
    *queue.should_pause.lock().unwrap() = true;
  } else {
    let conn = open_database_connection(&app)?;
    conn
      .execute(
        "UPDATE download_jobs SET status = 'paused', updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?1 AND status = 'pending'",
        params![payload.id],
      )
      .map_err(|e| format!("could_not_pause_job: {e}"))?;
  }
  Ok(())
}

#[tauri::command]
pub fn resume_job(app: AppHandle, payload: JobIdPayload) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "UPDATE download_jobs SET status = 'pending', updated_at = CURRENT_TIMESTAMP \
       WHERE id = ?1 AND status = 'paused'",
      params![payload.id],
    )
    .map_err(|e| format!("could_not_resume_job: {e}"))?;
  drop(conn);

  let app_clone = app.clone();
  let queue: tauri::State<'_, QueueManager> = app_clone.state();
  maybe_start_next_job(
    app,
    queue.active_job_id.clone(),
    queue.should_cancel.clone(),
    queue.should_pause.clone(),
  );
  Ok(())
}

#[tauri::command]
pub async fn clear_completed_jobs(app: AppHandle) -> Result<Vec<String>, String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let value = client
    .get(format!("http://127.0.0.1:{port}/jobs"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))?;

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

  let conn = open_database_connection(&app)?;
  let mut removed: Vec<String> = Vec::new();

  for row in rows {
    let job = match serde_json::from_value::<SidecarJobWatcher>(row) {
      Ok(job) => job,
      Err(_) => continue,
    };
    let extracted = get_extraction_status(&conn, &job.id);
    let should_remove = matches!(job.status.as_str(), "completed" | "cancelled" | "failed")
      || matches!(extracted.as_deref(), Some("extracted"));
    if !should_remove {
      continue;
    }
    let _ = client
      .delete(format!("http://127.0.0.1:{port}/jobs/{}", job.id))
      .send()
      .await;
    let _ = conn.execute(
      "DELETE FROM extraction_log WHERE job_id = ?1",
      params![job.id],
    );
    removed.push(job.id);
  }

  conn
    .execute(
      "DELETE FROM download_jobs WHERE status IN ('completed', 'cancelled', 'failed')",
      [],
    )
    .map_err(|e| format!("could_not_clear_jobs: {e}"))?;

  Ok(removed)
}
fn maybe_start_next_job(
  app: AppHandle,
  active_arc: Arc<Mutex<Option<i64>>>,
  cancel_arc: Arc<Mutex<bool>>,
  pause_arc: Arc<Mutex<bool>>,
) {
  // Bail out early if a job is already running
  {
    let active = active_arc.lock().unwrap();
    if active.is_some() {
      return;
    }
  }

  let conn = match open_database_connection(&app) {
    Ok(c) => c,
    Err(_) => return,
  };

  let next: Option<(i64, String)> = conn
    .query_row(
      "SELECT id, title FROM download_jobs \
       WHERE status = 'pending' ORDER BY priority DESC, id ASC LIMIT 1",
      [],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .ok();

  let (job_id, _title) = match next {
    Some(j) => j,
    None => return,
  };

  // Claim the slot (check again to prevent races)
  {
    let mut active = active_arc.lock().unwrap();
    if active.is_some() {
      return;
    }
    *active = Some(job_id);
  }

  *cancel_arc.lock().unwrap() = false;
  *pause_arc.lock().unwrap() = false;

  let _ = conn.execute(
    "UPDATE download_jobs SET status = 'downloading', updated_at = CURRENT_TIMESTAMP \
     WHERE id = ?1",
    params![job_id],
  );

  let app_c = app.clone();
  let active_c = active_arc.clone();
  let cancel_c = cancel_arc.clone();
  let pause_c = pause_arc.clone();

  tauri::async_runtime::spawn(async move {
    let mut final_status = "completed";
    let mut last_progress = 0i64;

    for progress in 0i64..=100 {
      last_progress = progress;

      if *cancel_c.lock().unwrap() {
        final_status = "cancelled";
        break;
      }
      if *pause_c.lock().unwrap() {
        final_status = "paused";
        break;
      }

      // Persist progress checkpoint every 5 steps
      if progress % 5 == 0 {
        if let Ok(conn) = open_database_connection(&app_c) {
          let _ = conn.execute(
            "UPDATE download_jobs SET progress = ?1, updated_at = CURRENT_TIMESTAMP \
             WHERE id = ?2",
            params![progress, job_id],
          );
        }
      }

      let _ = app_c.emit(
        QUEUE_EVENT_JOB_PROGRESS,
        JobProgressEvent {
          job_id: job_id.to_string(),
          progress: progress as f64,
          status: "downloading".to_string(),
          speed_bytes_per_sec: 1_200_000,
          eta_seconds: (100 - progress) * 2,
          bytes_downloaded: None,
          total_bytes: None,
        },
      );

      sleep(Duration::from_millis(300)).await;
    }

    // Persist final state
    let final_progress = if final_status == "completed" { 100 } else { last_progress };
    if let Ok(conn) = open_database_connection(&app_c) {
      let _ = conn.execute(
        "UPDATE download_jobs SET status = ?1, progress = ?2, \
         updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![final_status, final_progress, job_id],
      );
    }

    let _ = app_c.emit(
      QUEUE_EVENT_JOB_PROGRESS,
      JobProgressEvent {
        job_id: job_id.to_string(),
        progress: final_progress as f64,
        status: final_status.to_string(),
        speed_bytes_per_sec: 0,
        eta_seconds: 0,
        bytes_downloaded: None,
        total_bytes: None,
      },
    );

    if final_status == "completed" {
      let _ = app_c
        .notification()
        .builder()
        .title("Download concluido")
        .body(format!("Job #{job_id} finalizado com sucesso."))
        .show();
    }

    *active_c.lock().unwrap() = None;
    *cancel_c.lock().unwrap() = false;
    *pause_c.lock().unwrap() = false;

    // Automatically start the next pending job
    if final_status == "completed" {
      maybe_start_next_job(app_c, active_c, cancel_c, pause_c);
    }
  });
}

/// On startup, reset jobs that were interrupted mid-download back to pending
pub fn startup_queue_recovery(app: &AppHandle) {
  if let Ok(conn) = open_database_connection(app) {
    let _ = conn.execute(
      "UPDATE download_jobs SET status = 'pending', updated_at = CURRENT_TIMESTAMP \
       WHERE status = 'downloading'",
      [],
    );
  }
  let queue: tauri::State<'_, QueueManager> = app.state();
  maybe_start_next_job(
    app.clone(),
    queue.active_job_id.clone(),
    queue.should_cancel.clone(),
    queue.should_pause.clone(),
  );
}
