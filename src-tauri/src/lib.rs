mod archive;
mod catalog;
mod commands;
mod config;
mod covers;
mod db;
mod dto;
mod launch;
mod launch_errors;
mod library;
mod queue;
mod sidecar;
mod sources;
mod state;
mod title;

use commands::*;
use queue::startup_queue_recovery;
use sidecar::{
  pause_all_active_sidecar_jobs, spawn_download_engine, spawn_extraction_watcher,
  spawn_sidecar_progress_watcher,
};
use state::{ExtractionState, QueueManager, SidecarState};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(QueueManager::new())
    .manage(SidecarState::default())
    .manage(ExtractionState::default())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      app.handle().plugin(tauri_plugin_notification::init())?;
      app.handle().plugin(tauri_plugin_dialog::init())?;
      let _ = crate::db::open_database_connection(app.handle());
      startup_queue_recovery(app.handle());
      spawn_download_engine(app.handle().clone());
      spawn_sidecar_progress_watcher(app.handle().clone());
      spawn_extraction_watcher(app.handle().clone());

      let show_item = MenuItem::with_id(app, "tray_show", "Mostrar janela", true, None::<&str>)?;
      let hide_item = MenuItem::with_id(app, "tray_hide", "Ocultar janela", true, None::<&str>)?;
      let quit_item = MenuItem::with_id(app, "tray_quit", "Sair", true, None::<&str>)?;
      let tray_menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

      let app_handle = app.handle().clone();
      let _tray = TrayIconBuilder::new()
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
          "tray_show" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
          "tray_hide" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.hide();
            }
          }
          "tray_quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(move |_tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            if let Some(window) = app_handle.get_webview_window("main") {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
        })
        .build(app)?;
      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { .. } = event {
        let app_handle = window.app_handle().clone();
        tauri::async_runtime::spawn(async move {
          if let Err(error) = pause_all_active_sidecar_jobs(app_handle).await {
            log::warn!("could_not_pause_jobs_on_close: {error}");
          }
        });
      }
    })
    .invoke_handler(tauri::generate_handler![
      ping,
      app_version,
      get_paths,
      add_source,
      add_download_source,
      list_sources,
      get_download_sources,
      remove_download_source,
      search_download_options,
      search_game_catalog,
      set_default_download_path,
      get_default_download_path,
      set_seed_torrents_enabled,
      get_seed_torrents_enabled,
      get_app_setting,
      set_app_setting,
      get_disk_free_bytes_for_path,
      scan_default_download_path,
      delete_local_library_item,
      remove_source,
      test_download_source,
      get_download_sources_changes,
      sync_download_sources,
      check_download_sources_changes,
      search_game_download_options,
      enqueue_job,
      list_jobs,
      cancel_job,
      pause_job,
      resume_job,
      clear_completed_jobs,
      sidecar_enqueue_job,
      sidecar_list_jobs,
      sidecar_pause_job,
      sidecar_resume_job,
      sidecar_cancel_job,
      remove_job_from_library,
      sidecar_open_job_folder,
      sidecar_launch_job,
      sidecar_status,
      launch_game_from_path,
      extract_job_archive,
      open_local_path,
      open_deep_link,
      list_game_covers,
      ensure_game_cover_cached,
      save_game_cover,
      resolve_game_cover_url,
      invalidate_game_cover_local,
      check_path_playable,
      inspect_library_path,
      set_library_game_root,
      launch_setup_from_path,
      extract_library_folder
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
