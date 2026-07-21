use crate::sidecar::graceful_app_quit;
use tauri::{Manager, Window, WindowEvent};

pub fn on_window_event(window: &Window, event: &WindowEvent) {
  if let WindowEvent::CloseRequested { api, .. } = event {
    let app_handle = window.app_handle().clone();
    let minimize = crate::db::open_database_connection(window.app_handle())
      .map(|conn| crate::db::read_app_setting_bool(&conn, "minimize_to_tray", false))
      .unwrap_or(false);
    if minimize {
      api.prevent_close();
      let _ = window.hide();
      return;
    }
    api.prevent_close();
    graceful_app_quit(app_handle);
  }
}
