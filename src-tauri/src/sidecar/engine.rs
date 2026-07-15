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
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{sleep, Duration};

const STALL_AFTER: Duration = Duration::from_secs(75);
const STALL_KICK_COOLDOWN: Duration = Duration::from_secs(45);
const STALL_MAX_KICKS: u32 = 3;
const STALL_MSG_RECOVERING: &str =
  "download_stalled_recovering: Sem atividade — a retomar automaticamente…";
const STALL_MSG_GIVE_UP: &str =
  "download_stalled: Download parado (sem peers/velocidade). Tente outra fonte no catálogo.";
const STALL_MSG_FAILOVER: &str =
  "download_failover: A procurar outra fonte no catálogo…";

#[derive(Debug, Clone)]
struct StallTracker {
  last_progress: f64,
  last_bytes: i64,
  last_change: Instant,
  kick_count: u32,
  last_kick: Option<Instant>,
  recovering: bool,
  failover_started: bool,
}

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
    let mut stall_state: HashMap<String, StallTracker> = HashMap::new();

    loop {
      sleep(Duration::from_millis(750)).await;

      let rows = match fetch_sidecar_jobs_progress(&app).await {
        Ok(items) => items,
        Err(_) => continue,
      };

      let active_ids: HashSet<String> = rows.iter().map(|row| row.id.clone()).collect();
      last_snapshot.retain(|id, _| active_ids.contains(id));
      stall_state.retain(|id, _| active_ids.contains(id));

      let mut batch_updates: Vec<(String, i64, i64, i64, Option<String>, String)> = Vec::new();
      let mut kick_ids: Vec<String> = Vec::new();
      let mut failover_ids: Vec<String> = Vec::new();

      for row in rows {
        let progress = normalize_sidecar_progress(
          row.progress,
          row.bytes_downloaded,
          row.total_bytes,
          &row.status,
        );

        let stall_hint = update_stall_tracker(
          &mut stall_state,
          &row,
          progress,
          &mut kick_ids,
          &mut failover_ids,
        );

        let changed = last_snapshot.get(&row.id).map_or(true, |prev| {
          let prev_progress = normalize_sidecar_progress(
            prev.progress,
            prev.bytes_downloaded,
            prev.total_bytes,
            &prev.status,
          );
          let bytes_delta = (row.bytes_downloaded - prev.bytes_downloaded).abs();
          // Não emitir a cada tick de speed — isso congelava a UI (Redux + Library + capas).
          prev.status != row.status
            || prev.error_msg != row.error_msg
            || (prev_progress - progress).abs() >= 0.5
            || bytes_delta >= 1_048_576
            || prev.total_bytes != row.total_bytes
            || stall_hint.is_some()
        });
        if !changed {
          continue;
        }
        last_snapshot.insert(row.id.clone(), row.clone());

        let error_msg = match stall_hint {
          Some(msg) => Some(msg),
          None => row.error_msg.clone(),
        };

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
            error_msg: error_msg.clone(),
          },
        );

        batch_updates.push((
          row.status.clone(),
          progress.round() as i64,
          row.bytes_downloaded,
          row.total_bytes,
          error_msg,
          row.id.clone(),
        ));
      }

      if !batch_updates.is_empty() {
        if let Ok(conn) = open_database_connection(&app) {
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
      }

      for id in kick_ids {
        if let Err(error) = kick_stalled_job(&app, &id).await {
          log::warn!("stall_kick_failed id={id}: {error}");
        }
      }

      for id in failover_ids {
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
          match super::failover::try_failover_stalled_job(app_clone, id.clone()).await {
            Ok(()) => log::info!("failover_ok id={id}"),
            Err(error) => log::warn!("failover_failed id={id}: {error}"),
          }
        });
      }
    }
  });
}

fn update_stall_tracker(
  stall_state: &mut HashMap<String, StallTracker>,
  row: &SidecarJobProgressRow,
  progress: f64,
  kick_ids: &mut Vec<String>,
  failover_ids: &mut Vec<String>,
) -> Option<String> {
  let active = matches!(
    row.status.as_str(),
    "downloading" | "retrying"
  );
  if !active {
    stall_state.remove(&row.id);
    return None;
  }

  // Download já completo (100%): não é stall — evita pause/resume infinito
  // e a mensagem "Sem atividade — a retomar automaticamente…".
  let finished_transfer = row.total_bytes >= 5 * 1024 * 1024
    && row.bytes_downloaded >= row.total_bytes
    && row.total_bytes > 0;
  if finished_transfer || progress >= 99.5 {
    let was = stall_state.remove(&row.id);
    return if was.map(|t| t.recovering || t.kick_count > 0).unwrap_or(false) {
      Some(String::new())
    } else {
      None
    };
  }

  let now = Instant::now();
  let speed = row.speed_bps.max(0);
  let tracker = stall_state.entry(row.id.clone()).or_insert_with(|| StallTracker {
    last_progress: progress,
    last_bytes: row.bytes_downloaded,
    last_change: now,
    kick_count: 0,
    last_kick: None,
    recovering: false,
    failover_started: false,
  });

  let moved = speed > 0
    || (progress - tracker.last_progress).abs() >= 0.2
    || row.bytes_downloaded > tracker.last_bytes;

  if moved {
    let was_soft_error = tracker.recovering || tracker.kick_count > 0;
    tracker.last_progress = progress;
    tracker.last_bytes = row.bytes_downloaded;
    tracker.last_change = now;
    tracker.recovering = false;
    tracker.kick_count = 0;
    tracker.last_kick = None;
    // String vazia = limpar aviso de stall na UI/DB.
    return if was_soft_error {
      Some(String::new())
    } else {
      None
    };
  }

  let stalled_for = now.duration_since(tracker.last_change);
  if stalled_for < STALL_AFTER {
    return if tracker.recovering {
      Some(STALL_MSG_RECOVERING.to_string())
    } else {
      None
    };
  }

  let can_kick = tracker.kick_count < STALL_MAX_KICKS
    && tracker
      .last_kick
      .map(|t| now.duration_since(t) >= STALL_KICK_COOLDOWN)
      .unwrap_or(true);

  if can_kick {
    tracker.kick_count += 1;
    tracker.last_kick = Some(now);
    tracker.recovering = true;
    tracker.last_change = now;
    kick_ids.push(row.id.clone());
    log::info!(
      "stall_kick id={} attempt={}/{}",
      row.id,
      tracker.kick_count,
      STALL_MAX_KICKS
    );
    return Some(STALL_MSG_RECOVERING.to_string());
  }

  if tracker.kick_count >= STALL_MAX_KICKS {
    if !tracker.failover_started {
      tracker.failover_started = true;
      failover_ids.push(row.id.clone());
      return Some(STALL_MSG_FAILOVER.to_string());
    }
    return Some(STALL_MSG_GIVE_UP.to_string());
  }

  if tracker.recovering {
    Some(STALL_MSG_RECOVERING.to_string())
  } else {
    None
  }
}

async fn kick_stalled_job(app: &AppHandle, id: &str) -> Result<(), String> {
  let port = ensure_sidecar_running(app.clone()).await?;
  let client = reqwest::Client::new();
  let pause = client
    .post(format!("http://127.0.0.1:{port}/jobs/{id}/pause"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?;
  if !pause.status().is_success() {
    let status = pause.status();
    let body = pause.text().await.unwrap_or_default();
    return Err(format!("sidecar_pause_failed: {status} {body}"));
  }
  sleep(Duration::from_millis(800)).await;
  let resume = client
    .post(format!("http://127.0.0.1:{port}/jobs/{id}/resume"))
    .send()
    .await
    .map_err(|e| format!("sidecar_request_failed: {e}"))?;
  if !resume.status().is_success() {
    let status = resume.status();
    let body = resume.text().await.unwrap_or_default();
    return Err(format!("sidecar_resume_failed: {status} {body}"));
  }
  Ok(())
}
