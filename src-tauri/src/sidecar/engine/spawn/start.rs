use crate::state::SidecarState;
use tauri::{AppHandle, Manager};

use super::paths::{resolve_aria2_path, resolve_engine_path};

/// Spawns the download-engine binary and captures its port announcement from stdout.
/// The binary must be built and placed at the expected path.
pub fn spawn_download_engine(app: AppHandle) {
  tauri::async_runtime::spawn(async move {
    let sidecar: tauri::State<'_, SidecarState> = app.state();
    sidecar.set_booting(true);
    sidecar.clear_port();

    let engine_path = resolve_engine_path(&app);
    let data_dir = app
      .path()
      .app_data_dir()
      .map(|p| p.to_string_lossy().to_string())
      .unwrap_or_else(|_| ".".to_string());
    let aria2_path = resolve_aria2_path(&app, &engine_path);

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
