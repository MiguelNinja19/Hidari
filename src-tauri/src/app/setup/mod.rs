mod init;
mod plugins;
mod services;
mod tray;

use super::env::load_env_from_app_config;
use tauri::App;

pub fn configure_app(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
  load_env_from_app_config(app.handle());
  plugins::register(app)?;
  init::run_migrations_and_repairs(app.handle())?;
  emit_startup_deep_links(app.handle());
  services::start_background_workers(app.handle());
  tray::install(app)?;
  Ok(())
}

/// Atalhos `.lnk` passam `hidari://…` como argumento do exe no arranque a frio.
fn emit_startup_deep_links(_app: &tauri::AppHandle) {
  for arg in std::env::args().skip(1) {
    if arg.starts_with("hidari://") || arg.starts_with("mylauncher://") {
      let _ = crate::sidecar::queue_deep_link_event(&arg);
    }
  }
}

pub(crate) fn on_second_instance(app: &tauri::AppHandle, argv: Vec<String>) {
  crate::app::window::show_main_window(app);
  for arg in argv {
    if arg.starts_with("hidari://") || arg.starts_with("mylauncher://") {
      let _ = crate::sidecar::emit_deep_link_event(app, &arg);
    }
  }
}
