use tauri::{AppHandle, Manager};

#[cfg(windows)]
use super::windows_aumid;

/// Chamar no startup (antes de enviar toasts).
pub fn setup_desktop_notifications(app: &AppHandle) {
  #[cfg(windows)]
  {
    let identifier = app.config().identifier.clone();
    let display_name = app
      .config()
      .product_name
      .clone()
      .unwrap_or_else(|| "Hidari".to_string());
    let icon = app
      .path()
      .resource_dir()
      .ok()
      .map(|dir| dir.join("icons").join("icon.png"))
      .filter(|p| p.is_file())
      .or_else(|| {
        std::env::current_exe()
          .ok()
          .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
          .map(|dir| dir.join("icons").join("icon.png"))
          .filter(|p| p.is_file())
      });
    windows_aumid::register(&identifier, &display_name, icon.as_deref());
  }

  #[cfg(not(windows))]
  {
    let _ = app;
  }
}
