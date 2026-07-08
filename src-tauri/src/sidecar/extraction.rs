use super::engine::{ensure_sidecar_running, fetch_sidecar_job, resolve_job_folder};
use crate::archive;
use crate::config::{MIN_DOWNLOAD_VERIFY_BYTES, SEVEN_ZIP_BINARY};
use crate::db::{
  get_extraction_status, open_database_connection, read_app_setting, read_app_setting_bool,
  upsert_extraction_log,
};
use crate::dto::{EXTRACT_EVENT_STATUS, ExtractStatusEvent, SidecarJobWatcher};
use crate::launch;
use crate::library::roots::open_path_in_shell;
use crate::state::ExtractionState;
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{sleep, Duration};

pub fn emit_extract_status(app: &AppHandle, job_id: &str, status: &str, message: Option<String>) {
  let _ = app.emit(
    EXTRACT_EVENT_STATUS,
    ExtractStatusEvent {
      job_id: job_id.to_string(),
      status: status.to_string(),
      message,
    },
  );
}

// Extração automática desativada na UI; funções mantidas para extract_library_folder / reativação futura.
#[allow(dead_code)]
pub fn resolve_7z_path(app: &AppHandle) -> Result<PathBuf, String> {
  let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  let mut candidates: Vec<PathBuf> = vec![
    manifest.join("binaries").join("7za.exe"),
    manifest.join("binaries").join(SEVEN_ZIP_BINARY),
    PathBuf::from(r"C:\Program Files\7-Zip\7z.exe"),
    PathBuf::from(r"C:\Program Files (x86)\7-Zip\7z.exe"),
  ];

  if let Ok(resource_dir) = app.path().resource_dir() {
    candidates.push(resource_dir.join("binaries").join("7za.exe"));
    candidates.push(resource_dir.join("binaries").join("7z.exe"));
    candidates.push(resource_dir.join("7za.exe"));
    candidates.push(resource_dir.join("7z.exe"));
  }

  if let Ok(cwd) = std::env::current_dir() {
    candidates.push(cwd.join("binaries").join("7za.exe"));
    candidates.push(cwd.join("binaries").join("7z.exe"));
    candidates.push(cwd.join("src-tauri").join("binaries").join("7za.exe"));
    candidates.push(cwd.join("src-tauri").join("binaries").join("7z.exe"));
  }

  if let Some(found) = candidates.into_iter().find(|p| p.exists()) {
    return Ok(found);
  }

  if which_7z_on_path().is_some() {
    return Ok(PathBuf::from("7z"));
  }

  Err(
    "7z_not_found: execute npm run setup:binaries ou coloque 7za.exe em src-tauri/binaries/"
      .to_string(),
  )
}

#[cfg(target_os = "windows")]
#[allow(dead_code)]
pub fn which_7z_on_path() -> Option<PathBuf> {
  StdCommand::new("where")
    .arg("7z")
    .output()
    .ok()
    .filter(|o| o.status.success())
    .and_then(|o| {
      String::from_utf8(o.stdout)
        .ok()
        .and_then(|s| s.lines().next().map(|l| PathBuf::from(l.trim())))
    })
}

#[cfg(not(target_os = "windows"))]
#[allow(dead_code)]
pub fn which_7z_on_path() -> Option<PathBuf> {
  StdCommand::new("which")
    .arg("7z")
    .output()
    .ok()
    .filter(|o| o.status.success())
    .and_then(|o| {
      String::from_utf8(o.stdout)
        .ok()
        .map(|s| PathBuf::from(s.trim()))
    })
}

pub fn apply_extraction_overlay(job: &mut serde_json::Map<String, serde_json::Value>, conn: &Connection) {
  let Some(id) = job
    .get("id")
    .and_then(|value| value.as_str().map(str::to_string))
  else {
    return;
  };

  let Ok(row) = conn.query_row(
    "SELECT status, extract_path, error FROM extraction_log WHERE job_id = ?1",
    params![id],
    |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, Option<String>>(1)?,
        row.get::<_, Option<String>>(2)?,
      ))
    },
  ) else {
    return;
  };

  let (status, extract_path, error) = row;
  if matches!(status.as_str(), "extracting" | "extracted" | "failed") {
    job.insert("status".to_string(), serde_json::Value::String(status));
  }
  if let Some(path) = extract_path {
    job.insert(
      "extractPath".to_string(),
      serde_json::Value::String(path),
    );
  }
  if let Some(message) = error {
    job.insert(
      "errorMsg".to_string(),
      serde_json::Value::String(message),
    );
  }
}

pub fn enrich_jobs_with_extraction(
  value: &mut serde_json::Value,
  conn: &Connection,
) {
  match value {
    serde_json::Value::Array(items) => {
      for item in items {
        if let serde_json::Value::Object(map) = item {
          apply_extraction_overlay(map, conn);
        }
      }
    }
    serde_json::Value::Object(map) => {
      for key in ["jobs", "data", "items"] {
        if let Some(serde_json::Value::Array(items)) = map.get_mut(key) {
          for item in items {
            if let serde_json::Value::Object(job) = item {
              apply_extraction_overlay(job, conn);
            }
          }
          return;
        }
      }
    }
    _ => {}
  }
}

#[allow(dead_code)]
pub fn run_7z_extract(seven_zip: &Path, archive: &Path, dest: &Path) -> Result<(), String> {
  std::fs::create_dir_all(dest)
    .map_err(|e| format!("could_not_create_extract_dir: {e}"))?;

  let dest_arg = format!("-o{}", dest.display());
  let mut command = StdCommand::new(seven_zip);
  if let Some(parent) = seven_zip.parent() {
    if !parent.as_os_str().is_empty() {
      command.current_dir(parent);
    }
  }

  let output = command
    .arg("x")
    .arg("-y")
    .arg(&dest_arg)
    .arg(archive)
    .output()
    .map_err(|e| format!("could_not_run_7z: {e}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    return Err(format!(
      "7z_extract_failed: status={} stderr={} stdout={}",
      output.status, stderr, stdout
    ));
  }
  Ok(())
}

#[allow(dead_code)]
pub fn run_after_install_action(
  app: &AppHandle,
  title: &str,
  dest_path: &str,
  extract_dest: &Path,
) {
  let conn = match open_database_connection(app) {
    Ok(c) => c,
    Err(_) => return,
  };
  let action = read_app_setting(&conn, "after_install_action")
    .unwrap_or_else(|| "ask".to_string());
  drop(conn);

  match action.as_str() {
    "open-folder" => {
      if let Err(error) = open_path_in_shell(extract_dest) {
        log::warn!("after_install_open_folder_failed: {error}");
      }
    }
    "launch-game" => {
      if let Err(error) = launch::resolve_and_launch_game(title, dest_path) {
        log::warn!("after_install_launch_failed: {error}");
      }
    }
    _ => {}
  }
}

pub fn finalize_job_if_playable(
  app: &AppHandle,
  job_id: &str,
  title: &str,
  dest_path: &str,
) -> Result<bool, String> {
  let candidates = match launch::resolve_launch_candidates(title, dest_path) {
    Ok(items) => items,
    Err(_) => return Ok(false),
  };
  let extract_path = candidates
    .first()
    .and_then(|path| path.parent())
    .map(|path| path.to_string_lossy().to_string());

  let conn = open_database_connection(app)?;
  upsert_extraction_log(
    &conn,
    job_id,
    "extracted",
    None,
    extract_path.as_deref(),
    None,
  )?;
  emit_extract_status(
    app,
    job_id,
    "extracted",
    Some("Executável encontrado na pasta — extração não necessária".to_string()),
  );
  Ok(true)
}

fn is_valid_download_extension(path: &Path) -> bool {
  if archive::is_archive_extension(path) {
    return true;
  }
  path.extension()
    .and_then(|ext| ext.to_str())
    .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "exe" | "msi" | "iso" | "bin"))
    .unwrap_or(false)
}

fn find_primary_download_file(dest_path: &str) -> Option<PathBuf> {
  if let Some(archive) = archive::find_job_archive(dest_path) {
    return Some(archive);
  }
  let folder = resolve_job_folder(dest_path);
  if !folder.is_dir() {
    return None;
  }
  let mut best: Option<(u64, PathBuf)> = None;
  if let Ok(entries) = std::fs::read_dir(&folder) {
    for entry in entries.flatten() {
      let path = entry.path();
      if !path.is_file() || !is_valid_download_extension(&path) {
        continue;
      }
      let size = entry.metadata().ok().map(|m| m.len()).unwrap_or(0);
      if best.as_ref().map(|(best_size, _)| size > *best_size).unwrap_or(true) {
        best = Some((size, path));
      }
    }
  }
  best.map(|(_, path)| path)
}

pub fn verify_download_payload(dest_path: &str) -> Result<PathBuf, String> {
  let file = find_primary_download_file(dest_path)
    .ok_or_else(|| "verify_no_file: nenhum ficheiro válido encontrado na pasta do download".to_string())?;
  if !file.is_file() {
    return Err("verify_missing: ficheiro não existe".to_string());
  }
  let size = std::fs::metadata(&file)
    .map_err(|error| format!("verify_stat: {error}"))?
    .len();
  if size < MIN_DOWNLOAD_VERIFY_BYTES {
    return Err(format!(
      "verify_too_small: ficheiro muito pequeno ({size} bytes, mínimo {MIN_DOWNLOAD_VERIFY_BYTES})"
    ));
  }
  Ok(file)
}

pub async fn process_job_post_download(
  app: AppHandle,
  job_id: String,
  title: String,
  dest_path: String,
) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  let prior = get_extraction_status(&conn, &job_id);
  if matches!(
    prior.as_deref(),
    Some("extracting") | Some("extracted") | Some("skipped") | Some("failed")
  ) {
    return Ok(());
  }
  drop(conn);

  match verify_download_payload(&dest_path) {
    Ok(file) => {
      let conn = open_database_connection(&app)?;
      upsert_extraction_log(
        &conn,
        &job_id,
        "verified",
        Some(&file.to_string_lossy()),
        None,
        None,
      )?;
    }
    Err(message) => {
      let conn = open_database_connection(&app)?;
      upsert_extraction_log(&conn, &job_id, "verify_failed", None, None, Some(&message))?;
      emit_extract_status(&app, &job_id, "verify_failed", Some(message.clone()));
      return Err(message);
    }
  }

  if finalize_job_if_playable(&app, &job_id, &title, &dest_path)? {
    return Ok(());
  }

  let mark_skipped = |app: &AppHandle, message: &str| -> Result<(), String> {
    let conn = open_database_connection(app)?;
    upsert_extraction_log(&conn, &job_id, "skipped", None, None, None)?;
    emit_extract_status(app, &job_id, "skipped", Some(message.to_string()));
    Ok(())
  };

  if launch::find_setup_executable(&title, &dest_path).is_some() {
    return mark_skipped(&app, "Download concluído — clique em INSTALAR para executar o setup.exe.");
  }

  mark_skipped(
    &app,
    "Download concluído. Clique em INSTALAR se houver setup.exe na pasta.",
  )
}

pub async fn process_job_extraction(
  app: AppHandle,
  job_id: String,
  title: String,
  dest_path: String,
) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  let install_org = read_app_setting(&conn, "install_organization")
    .unwrap_or_else(|| "separate-folder".to_string());
  let remove_temp = read_app_setting_bool(&conn, "remove_temp_files", true);
  drop(conn);

  let archive = match archive::find_job_archive(&dest_path) {
    Some(path) => path,
    None => {
      return Err(
        "no_archive_found: nenhum arquivo compactado (.zip, .7z, .rar) encontrado na pasta do download"
          .to_string(),
      );
    }
  };

  let base_dir = resolve_job_folder(&dest_path);
  let extract_dest = archive::resolve_extract_destination(&title, &base_dir, &install_org);

  upsert_extraction_log(
    &open_database_connection(&app)?,
    &job_id,
    "extracting",
    Some(&archive.to_string_lossy()),
    Some(&extract_dest.to_string_lossy()),
    None,
  )?;
  emit_extract_status(&app, &job_id, "extracting", None);

  let seven_zip = resolve_7z_path(&app)?;
  run_7z_extract(&seven_zip, &archive, &extract_dest)?;

  if remove_temp && archive.exists() {
    if let Err(error) = std::fs::remove_file(&archive) {
      log::warn!("could_not_remove_archive_after_extract: {error}");
    }
  }

  upsert_extraction_log(
    &open_database_connection(&app)?,
    &job_id,
    "extracted",
    Some(&archive.to_string_lossy()),
    Some(&extract_dest.to_string_lossy()),
    None,
  )?;
  emit_extract_status(&app, &job_id, "extracted", None);
  run_after_install_action(&app, &title, &dest_path, &extract_dest);
  Ok(())
}

#[tauri::command]
pub async fn extract_job_archive(app: AppHandle, id: String) -> Result<(), String> {
  let job = fetch_sidecar_job(&app, &id).await?;
  let extraction = app.state::<ExtractionState>();
  if !extraction.try_acquire() {
    return Err("extraction_busy".to_string());
  }

  let app_clone = app.clone();
  let job_id = job.id.clone();
  let title = job.title.clone();
  let dest_path = job.dest_path.clone();

  let result = process_job_post_download(app_clone.clone(), job_id, title, dest_path).await;
  extraction.release();

  if let Err(ref error) = result {
    let _ = upsert_extraction_log(
      &open_database_connection(&app_clone)?,
      &id,
      "failed",
      None,
      None,
      Some(error),
    );
    emit_extract_status(&app_clone, &id, "failed", Some(error.clone()));
  }
  result
}

pub async fn list_sidecar_jobs_for_watcher(app: &AppHandle) -> Result<Vec<SidecarJobWatcher>, String> {
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
    .filter_map(|row| serde_json::from_value::<SidecarJobWatcher>(row).ok())
    .collect())
}

pub fn job_ready_for_post_download(job: &SidecarJobWatcher) -> bool {
  if job.status == "completed" {
    return true;
  }
  if job.status == "seeding" {
    if archive::find_job_archive(&job.dest_path).is_some() {
      return true;
    }
    return launch::job_has_playable_executable(&job.title, &job.dest_path);
  }
  false
}

pub fn spawn_extraction_watcher(app: AppHandle) {
  tauri::async_runtime::spawn(async move {
    loop {
      sleep(Duration::from_secs(2)).await;

      let jobs = match list_sidecar_jobs_for_watcher(&app).await {
        Ok(items) => items,
        Err(_) => continue,
      };

      let conn = match open_database_connection(&app) {
        Ok(c) => c,
        Err(_) => continue,
      };

      let extraction: tauri::State<'_, ExtractionState> = app.state();
      if !extraction.try_acquire() {
        continue;
      }

      let mut started = false;
      for job in jobs {
        if !job_ready_for_post_download(&job) {
          continue;
        }
        let prior = get_extraction_status(&conn, &job.id);
        if matches!(
          prior.as_deref(),
          Some("extracting") | Some("extracted") | Some("skipped") | Some("failed")
        ) {
          continue;
        }

        let app_clone = app.clone();
        let job_id = job.id.clone();
        let title = job.title.clone();
        let dest_path = job.dest_path.clone();

        tauri::async_runtime::spawn(async move {
          if let Err(error) = process_job_post_download(
            app_clone.clone(),
            job_id.clone(),
            title,
            dest_path,
          )
          .await
          {
            if let Ok(conn) = open_database_connection(&app_clone) {
              let _ = upsert_extraction_log(
                &conn,
                &job_id,
                "failed",
                None,
                None,
                Some(&error),
              );
            }
            emit_extract_status(&app_clone, &job_id, "failed", Some(error));
          }
          let extraction: tauri::State<'_, ExtractionState> = app_clone.state();
          extraction.release();
        });
        started = true;
        break;
      }

      if !started {
        extraction.release();
      }
    }
  });
}
