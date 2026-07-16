//! Notificações de ambiente de trabalho (Windows: AUMID + toast silencioso).

use tauri::{AppHandle, Manager};

#[cfg(windows)]
mod windows_aumid {
  use std::ffi::OsStr;
  use std::os::windows::ffi::OsStrExt;
  use std::path::Path;
  use winreg::enums::HKEY_CURRENT_USER;
  use winreg::RegKey;

  /// Regista o AUMID em HKCU para toasts WinRT funcionarem sem instalador
  /// (e em dev / portable). Também associa o processo ao mesmo ID.
  pub fn register(aumid: &str, display_name: &str, icon_path: Option<&Path>) {
    if aumid.trim().is_empty() {
      return;
    }

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = format!(r"Software\Classes\AppUserModelId\{aumid}");
    if let Ok((key, _)) = hkcu.create_subkey(&path) {
      let _ = key.set_value("DisplayName", &display_name);
      if let Some(icon) = icon_path.filter(|p| p.is_file()) {
        let icon_uri = icon.to_string_lossy().to_string();
        let _ = key.set_value("IconUri", &icon_uri);
      }
    }

    let wide: Vec<u16> = OsStr::new(aumid)
      .encode_wide()
      .chain(std::iter::once(0))
      .collect();
    unsafe {
      let _ = windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(
        wide.as_ptr(),
      );
    }
  }
}

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

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopNotificationPayload {
  pub title: String,
  pub body: String,
}

/// Envia toast nativo **sempre silencioso** (menos intrusivo).
#[tauri::command]
pub fn send_desktop_notification(
  app: AppHandle,
  payload: DesktopNotificationPayload,
) -> Result<(), String> {
  let title = payload.title.trim();
  let body = payload.body.trim();
  if title.is_empty() {
    return Err("notification_title_empty".to_string());
  }

  let identifier = app.config().identifier.clone();

  #[cfg(windows)]
  {
    use tauri_winrt_notification::Toast;

    return Toast::new(&identifier)
      .title(title)
      .text1(if body.is_empty() { " " } else { body })
      .sound(None) // sempre silencioso
      .show()
      .map_err(|error| format!("notification_show_failed: {error:?}"));
  }

  #[cfg(not(windows))]
  {
    let mut notification = notify_rust::Notification::new();
    notification.summary(title);
    if !body.is_empty() {
      notification.body(body);
    }
    // Sem sound_name → sem som no desktop.

    #[cfg(target_os = "macos")]
    {
      let _ = notify_rust::set_application(if tauri::is_dev() {
        "com.apple.Terminal"
      } else {
        identifier.as_str()
      });
    }

    #[cfg(not(target_os = "macos"))]
    {
      let _ = identifier;
    }

    notification
      .show()
      .map(|_| ())
      .map_err(|error| format!("notification_show_failed: {error}"))
  }
}
