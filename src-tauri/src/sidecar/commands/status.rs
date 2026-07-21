use crate::state::SidecarState;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn sidecar_status(app: AppHandle) -> serde_json::Value {
  let sidecar: tauri::State<'_, SidecarState> = app.state();
  match sidecar.get_port() {
    Some(port) => serde_json::json!({ "running": true, "port": port, "booting": sidecar.is_booting() }),
    None => serde_json::json!({ "running": false, "booting": sidecar.is_booting() }),
  }
}
