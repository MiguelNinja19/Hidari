use super::super::engine::{fetch_sidecar_job, resolve_job_folder};
use std::process::Command as StdCommand;
use tauri::AppHandle;

#[tauri::command]
pub async fn sidecar_open_job_folder(app: AppHandle, id: String) -> Result<(), String> {
  let job = fetch_sidecar_job(&app, &id).await?;
  let target_path = resolve_job_folder(&job.dest_path);
  if !target_path.exists() {
    return Err("job_folder_not_found".to_string());
  }

  #[cfg(target_os = "windows")]
  {
    StdCommand::new("explorer")
      .arg(target_path.as_os_str())
      .spawn()
      .map_err(|error| format!("could_not_open_folder: {error}"))?;
  }

  #[cfg(target_os = "linux")]
  {
    StdCommand::new("xdg-open")
      .arg(target_path.as_os_str())
      .spawn()
      .map_err(|error| format!("could_not_open_folder: {error}"))?;
  }

  #[cfg(target_os = "macos")]
  {
    StdCommand::new("open")
      .arg(target_path.as_os_str())
      .spawn()
      .map_err(|error| format!("could_not_open_folder: {error}"))?;
  }

  Ok(())
}
