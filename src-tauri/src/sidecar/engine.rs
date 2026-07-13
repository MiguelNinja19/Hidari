use crate::config::{self, ARIA2_BINARY};
use crate::db::open_database_connection;
use crate::dto::{JobProgressEvent, QUEUE_EVENT_JOB_PROGRESS, SidecarJobForLaunch, SidecarJobProgressRow};
use crate::queue::persist::{
  mark_active_persisted_jobs_paused, update_persisted_queue_progress,
};
use crate::state::SidecarState;
use rusqlite::params;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{sleep, Duration};

pub async fn fetch_sidecar_job(app: &AppHandle, id: &str) -> Result<SidecarJobForLaunch, String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  client
    .get(format!("http://127.0.0.1:{port}/jobs/{id}"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .error_for_status()
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<SidecarJobForLaunch>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))
}

pub fn resolve_job_folder(dest_path: &str) -> PathBuf {
  let path = PathBuf::from(dest_path);
  if path.is_dir() {
    path
  } else {
    path.parent().map(Path::to_path_buf).unwrap_or(path)
  }
}
pub async fn pause_all_active_sidecar_jobs(app: AppHandle) -> Result<(), String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let jobs = client
    .get(format!("http://127.0.0.1:{port}/jobs"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("sidecar_parse_failed: {e}"))?;

  let Some(job_list) = jobs.as_array() else {
    return Ok(());
  };

  let mut last_error: Option<String> = None;

  for job in job_list {
    let Some(status) = job.get("status").and_then(|value| value.as_str()) else {
      continue;
    };

    if status != "downloading" && status != "pending" && status != "seeding" && status != "retrying"
    {
      continue;
    }

    let Some(id) = job.get("id").and_then(|value| value.as_str()) else {
      continue;
    };

    match client
      .post(format!("http://127.0.0.1:{port}/jobs/{id}/pause"))
      .send()
      .await
    {
      Ok(response) if response.status().is_success() => {}
      Ok(response) => {
        let status_code = response.status();
        let body = response.text().await.unwrap_or_default();
        last_error = Some(format!("sidecar_pause_failed: {status_code} {body}"));
        log::warn!("pause_job_failed id={id}: {status_code}");
      }
      Err(error) => {
        last_error = Some(format!("sidecar_request_failed: {error}"));
        log::warn!("pause_job_failed id={id}: {error}");
      }
    }
  }

  if let Some(error) = last_error {
    return Err(error);
  }

  Ok(())
}

/// Pausa downloads ativos e termina a app (evita matar aria2 a meio do torrent).
pub fn graceful_app_quit(app: AppHandle) {
  tauri::async_runtime::spawn(async move {
    if let Err(error) = pause_all_active_sidecar_jobs(app.clone()).await {
      log::warn!("could_not_pause_jobs_on_quit: {error}");
    }
    if let Ok(conn) = open_database_connection(&app) {
      let _ = mark_active_persisted_jobs_paused(&conn);
    }
    app.exit(0);
  });
}

pub fn get_sidecar_port(app: &AppHandle) -> Result<u16, String> {
  let sidecar: tauri::State<'_, SidecarState> = app.state();
  sidecar
    .get_port()
    .ok_or_else(|| "sidecar_not_running".to_string())
}

/// Spawns the download-engine binary and captures its port announcement from stdout.
/// The binary must be built and placed at the expected path.
pub fn spawn_download_engine(app: AppHandle) {
  tauri::async_runtime::spawn(async move {
    let sidecar: tauri::State<'_, SidecarState> = app.state();
    sidecar.set_booting(true);
    sidecar.clear_port();

    let exe_name = config::download_engine_binary_name();
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut engine_candidates: Vec<std::path::PathBuf> = vec![
      manifest_dir.join("binaries").join(exe_name),
      manifest_dir.join(exe_name),
    ];
    if let Ok(resource_dir) = app.path().resource_dir() {
      engine_candidates.push(resource_dir.join("binaries").join(exe_name));
      engine_candidates.push(resource_dir.join(exe_name));
    }
    if let Ok(cwd) = std::env::current_dir() {
      engine_candidates.push(cwd.join(exe_name));
      engine_candidates.push(cwd.join("src-tauri").join(exe_name));
      engine_candidates.push(cwd.join("src-tauri").join("binaries").join(exe_name));
      engine_candidates.push(
        cwd.join("..")
          .join("download-engine")
          .join("target")
          .join("release")
          .join(exe_name),
      );
      engine_candidates.push(
        cwd.join("..")
          .join("download-engine")
          .join("target")
          .join("debug")
          .join(exe_name),
      );
    }
    if let Ok(app_data_dir) = app.path().app_data_dir() {
      engine_candidates.push(app_data_dir.parent().unwrap_or(&app_data_dir).join(exe_name));
    }
    let engine_path = engine_candidates
      .into_iter()
      .find(|path| path.exists())
      .unwrap_or_else(|| std::path::PathBuf::from(exe_name));

    let data_dir = app
      .path()
      .app_data_dir()
      .map(|p| p.to_string_lossy().to_string())
      .unwrap_or_else(|_| ".".to_string());

    let aria2_path = {
      let mut candidates: Vec<std::path::PathBuf> = Vec::new();
      let bundled_aria2 = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(ARIA2_BINARY);
      candidates.push(bundled_aria2.clone());
      if let Some(parent) = engine_path.parent() {
        let sidecar_local_aria2 = parent.join(ARIA2_BINARY);
        if !sidecar_local_aria2.exists() && bundled_aria2.exists() {
          let _ = std::fs::copy(&bundled_aria2, &sidecar_local_aria2);
        }
        candidates.push(sidecar_local_aria2);
        candidates.push(parent.join(ARIA2_BINARY));
        candidates.push(parent.join("tools").join(ARIA2_BINARY));
      }
      if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("binaries").join(ARIA2_BINARY));
        candidates.push(cwd.join("src-tauri").join("binaries").join(ARIA2_BINARY));
        candidates.push(cwd.join("..").join("src-tauri").join("binaries").join(ARIA2_BINARY));
      }
      if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(ARIA2_BINARY));
        candidates.push(resource_dir.join("tools").join(ARIA2_BINARY));
        candidates.push(resource_dir.join("binaries").join(ARIA2_BINARY));
      }
      candidates.into_iter().find(|path| path.exists())
    };

    let mut cmd = tokio::process::Command::new(&engine_path);
    cmd
      .env("ENGINE_DATA_DIR", &data_dir)
      .stdout(std::process::Stdio::piped())
      .stderr(std::process::Stdio::null());
    if let Some(path) = aria2_path {
      cmd.env("ARIA2C_PATH", path);
    }

    let mut child = match cmd.spawn() {
      Ok(c) => c,
      Err(e) => {
        log::warn!("download-engine not found/could not start at {engine_path:?}: {e}");
        let sidecar: tauri::State<'_, SidecarState> = app.state();
        sidecar.set_booting(false);
        return;
      }
    };

    if let Some(stdout) = child.stdout.take() {
      use tokio::io::{AsyncBufReadExt, BufReader};
      let mut lines = BufReader::new(stdout).lines();
      while let Ok(Some(line)) = lines.next_line().await {
        if let Some(port_str) = line.strip_prefix("DOWNLOAD_ENGINE_PORT=") {
          if let Ok(port) = port_str.trim().parse::<u16>() {
            let sidecar: tauri::State<'_, SidecarState> = app.state();
            sidecar.set_port(port);
            sidecar.set_booting(false);
            log::info!("download-engine ready on port {port}");
            break;
          }
        }
      }
    }

    let _ = child.wait().await;
    let sidecar: tauri::State<'_, SidecarState> = app.state();
    sidecar.clear_port();
    sidecar.set_booting(false);
    log::warn!("download-engine exited");
  });
}

pub async fn ensure_sidecar_running(app: AppHandle) -> Result<u16, String> {
  if let Ok(port) = get_sidecar_port(&app) {
    return Ok(port);
  }

  let should_spawn = {
    let sidecar: tauri::State<'_, SidecarState> = app.state();
    !sidecar.is_booting()
  };
  if should_spawn {
    spawn_download_engine(app.clone());
  }

  for _ in 0..20 {
    if let Ok(port) = get_sidecar_port(&app) {
      return Ok(port);
    }
    sleep(Duration::from_millis(200)).await;
  }

  Err("sidecar_not_running".to_string())
}
fn normalize_sidecar_progress(
  progress: f64,
  bytes_downloaded: i64,
  total_bytes: i64,
  status: &str,
) -> f64 {
  if total_bytes > 0 && bytes_downloaded >= 0 {
    return ((bytes_downloaded as f64 / total_bytes as f64) * 100.0).clamp(0.0, 100.0);
  }

  let pct = if progress > 0.0 && progress <= 1.0 {
    progress * 100.0
  } else {
    progress
  };

  let active = matches!(status, "downloading" | "pending" | "retrying" | "paused");

  if bytes_downloaded <= 0 && total_bytes <= 0 && active && pct >= 99.0 {
    return 0.0;
  }

  if bytes_downloaded <= 0 && total_bytes > 0 && active && pct >= 100.0 {
    return 0.0;
  }

  pct.clamp(0.0, 100.0)
}

pub async fn fetch_sidecar_jobs_progress(app: &AppHandle) -> Result<Vec<SidecarJobProgressRow>, String> {
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

  Ok(rows
    .into_iter()
    .filter_map(|row| serde_json::from_value::<SidecarJobProgressRow>(row).ok())
    .collect())
}

pub fn spawn_sidecar_progress_watcher(app: AppHandle) {
  tauri::async_runtime::spawn(async move {
    let mut last_snapshot: HashMap<String, SidecarJobProgressRow> = HashMap::new();

    loop {
      sleep(Duration::from_millis(750)).await;

      let rows = match fetch_sidecar_jobs_progress(&app).await {
        Ok(items) => items,
        Err(_) => continue,
      };

      let active_ids: HashSet<String> = rows.iter().map(|row| row.id.clone()).collect();
      last_snapshot.retain(|id, _| active_ids.contains(id));

      let mut batch_updates: Vec<(String, i64, i64, i64, Option<String>, String)> = Vec::new();

      for row in rows {
        let changed = last_snapshot.get(&row.id).map_or(true, |prev| {
          let prev_progress = normalize_sidecar_progress(
            prev.progress,
            prev.bytes_downloaded,
            prev.total_bytes,
            &prev.status,
          );
          let next_progress = normalize_sidecar_progress(
            row.progress,
            row.bytes_downloaded,
            row.total_bytes,
            &row.status,
          );
          prev.status != row.status
            || prev.error_msg != row.error_msg
            || (prev_progress - next_progress).abs() >= 0.05
            || prev.bytes_downloaded != row.bytes_downloaded
            || prev.total_bytes != row.total_bytes
            || prev.speed_bps != row.speed_bps
        });
        if !changed {
          continue;
        }
        last_snapshot.insert(row.id.clone(), row.clone());

        let progress = normalize_sidecar_progress(
          row.progress,
          row.bytes_downloaded,
          row.total_bytes,
          &row.status,
        );

        let _ = app.emit(
          QUEUE_EVENT_JOB_PROGRESS,
          JobProgressEvent {
            job_id: row.id.clone(),
            progress,
            status: row.status.clone(),
            speed_bytes_per_sec: row.speed_bps.max(0) as u64,
            eta_seconds: row.eta_seconds.max(0),
            bytes_downloaded: Some(row.bytes_downloaded),
            total_bytes: Some(row.total_bytes),
            error_msg: row.error_msg.clone(),
          },
        );

        batch_updates.push((
          row.status.clone(),
          progress.round() as i64,
          row.bytes_downloaded,
          row.total_bytes,
          row.error_msg.clone(),
          row.id.clone(),
        ));
      }

      if batch_updates.is_empty() {
        continue;
      }

      let Ok(conn) = open_database_connection(&app) else {
        continue;
      };
      let _ = conn.execute("BEGIN IMMEDIATE", []);
      for (status, progress, bytes, total, error_msg, id) in batch_updates {
        let _ = conn.execute(
          "UPDATE download_jobs SET status = ?1, progress = ?2, bytes_downloaded = ?3, \
           total_bytes = ?4, error_msg = COALESCE(?5, error_msg), \
           updated_at = CURRENT_TIMESTAMP WHERE id = ?6",
          params![status, progress, bytes, total, error_msg, id.parse::<i64>().unwrap_or(0)],
        );
        let _ = update_persisted_queue_progress(
          &conn,
          &id,
          &status,
          progress,
          bytes,
          total,
          error_msg.as_deref(),
        );
      }
      let _ = conn.execute("COMMIT", []);
    }
  });
}
