use crate::app::window::show_main_window;
use crate::sidecar::graceful_app_quit;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, Manager};

const TRAY_ID: &str = "hidari-main-tray";

pub fn install(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
  let app_icon = app.default_window_icon().cloned();
  if let (Some(window), Some(icon)) = (app.get_webview_window("main"), app_icon.clone()) {
    let _ = window.set_icon(icon);
  }

  // Evita ícone duplicado se o setup correr outra vez na mesma sessão.
  let _ = app.remove_tray_by_id(TRAY_ID);

  let show_item = MenuItem::with_id(app, "tray_show", "Mostrar janela", true, None::<&str>)?;
  let hide_item = MenuItem::with_id(app, "tray_hide", "Ocultar janela", true, None::<&str>)?;
  let quit_item = MenuItem::with_id(app, "tray_quit", "Sair", true, None::<&str>)?;
  let tray_menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

  let app_handle = app.handle().clone();
  let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
    .menu(&tray_menu)
    .tooltip("Hidari")
    .show_menu_on_left_click(false);
  if let Some(icon) = app_icon {
    tray_builder = tray_builder.icon(icon);
  }
  let tray = tray_builder
    .on_menu_event(move |app, event| match event.id.as_ref() {
      "tray_show" => show_main_window(app),
      "tray_hide" => {
        if let Some(window) = app.get_webview_window("main") {
          let _ = window.hide();
        }
      }
      "tray_quit" => graceful_app_quit(app.clone()),
      _ => {}
    })
    .on_tray_icon_event(move |_tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } = event
      {
        show_main_window(&app_handle);
      }
    })
    .build(app)?;

  // Mantém o handle vivo — Drop do tray remove o ícone.
  app.manage(tray);
  Ok(())
}
