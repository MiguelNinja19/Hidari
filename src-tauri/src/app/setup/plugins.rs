use tauri::App;
use tauri_plugin_deep_link::DeepLinkExt;

pub fn register(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
  if cfg!(debug_assertions) {
    app.handle().plugin(
      tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Info)
        .build(),
    )?;
  }
  app.handle().plugin(tauri_plugin_notification::init())?;
  crate::notifications::setup_desktop_notifications(app.handle());
  app.handle().plugin(tauri_plugin_dialog::init())?;
  #[cfg(desktop)]
  {
    app.handle().plugin(tauri_plugin_deep_link::init())?;
    let handle = app.handle().clone();
    app.deep_link().on_open_url(move |event| {
      for url in event.urls() {
        let _ = crate::sidecar::emit_deep_link_event(&handle, url.as_ref());
      }
    });
    app.handle()
      .plugin(tauri_plugin_updater::Builder::new().build())?;
  }
  Ok(())
}
