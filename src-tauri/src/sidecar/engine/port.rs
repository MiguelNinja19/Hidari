use crate::state::SidecarState;
use tauri::{AppHandle, Manager};
use tokio::time::{sleep, Duration};

use super::spawn::spawn_download_engine;

pub fn get_sidecar_port(app: &AppHandle) -> Result<u16, String> {
  let sidecar: tauri::State<'_, SidecarState> = app.state();
  sidecar
    .get_port()
    .ok_or_else(|| "sidecar_not_running".to_string())
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
