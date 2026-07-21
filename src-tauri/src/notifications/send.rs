use tauri::AppHandle;

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
      .sound(None)
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
