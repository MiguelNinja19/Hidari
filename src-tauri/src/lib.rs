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
use queue::{persist::restore_persisted_queue_jobs, startup_queue_recovery};
use sidecar::{
  emit_deep_link_event, graceful_app_quit, spawn_download_engine, spawn_extraction_watcher,
  spawn_sidecar_progress_watcher,
};
use state::{ExtractionState, SidecarState};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg(target_os = "windows")]
fn clear_window_title_bar_icon(hwnd: windows::Win32::Foundation::HWND) {
  use windows::Win32::Foundation::{LPARAM, WPARAM};
  use windows::Win32::UI::WindowsAndMessaging::{SendMessageW, WM_SETICON, ICON_BIG, ICON_SMALL};

  unsafe {
    let _ = SendMessageW(
      hwnd,
      WM_SETICON,
      Some(WPARAM(ICON_SMALL as usize)),
      Some(LPARAM(0)),
    );
    let _ = SendMessageW(
      hwnd,
      WM_SETICON,
      Some(WPARAM(ICON_BIG as usize)),
      Some(LPARAM(0)),
    );
  }
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  load_env_from_cwd();

  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      for arg in argv {
        if arg.starts_with("hidari://") || arg.starts_with("mylauncher://") {
          let _ = emit_deep_link_event(app, &arg);
        }
      }
    }))
    .manage(SidecarState::default())
    .manage(ExtractionState::default())
    .manage(covers::CoverPrecacheState::default())
    .setup(|app| {
      load_env_from_app_config(app.handle());
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      app.handle().plugin(tauri_plugin_notification::init())?;
      app.handle().plugin(tauri_plugin_dialog::init())?;
      #[cfg(desktop)]
      {
        app.handle().plugin(tauri_plugin_deep_link::init())?;
        let handle = app.handle().clone();
        app.deep_link().on_open_url(move |event| {
          for url in event.urls() {
            let _ = emit_deep_link_event(&handle, url.as_ref());
          }
        });
      }
      crate::db::init_database_pool(app.handle())?;
      if let (Ok(conn), Ok(covers_dir)) = (
        crate::db::open_database_connection(app.handle()),
        crate::covers::covers_dir_for_app(app.handle()),
      ) {
        match crate::covers::repair_corrupt_cover_paths(&conn, &covers_dir) {
          Ok(n) if n > 0 => eprintln!("cover_paths_repaired: {n} entradas inválidas limpas"),
          Err(error) => eprintln!("cover_paths_repair_failed: {error}"),
          _ => {}
        }
        match crate::covers::repair_corrupt_cover_urls(&conn) {
          Ok(n) if n > 0 => eprintln!("cover_urls_repaired: {n} URLs inválidas removidas"),
          Err(error) => eprintln!("cover_urls_repair_failed: {error}"),
          _ => {}
        }
      }
      startup_queue_recovery(app.handle());
      spawn_download_engine(app.handle().clone());
      {
        let restore_app = app.handle().clone();
        tauri::async_runtime::spawn(async move {
          // Wait for download-engine port before rehydrating paused/active jobs.
          for _ in 0..40 {
            if crate::sidecar::ensure_sidecar_running(restore_app.clone())
              .await
              .is_ok()
            {
              break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
          }
          restore_persisted_queue_jobs(restore_app).await;
        });
      }
      spawn_sidecar_progress_watcher(app.handle().clone());
      spawn_extraction_watcher(app.handle().clone());
      crate::library::watcher::spawn_download_folder_watcher(app.handle().clone());

      covers::maybe_refresh_steam_app_index(app.handle());

      // Pré-aquece FitGirl/etc. em background para pesquisa quase imediata.
      let warm_handle = app.handle().clone();
      std::thread::spawn(move || {
        crate::sources::hydralinks::warm_local_catalog_caches(&warm_handle);
      });

      let app_icon = app.default_window_icon().cloned();

      if let Some(window) = app.get_webview_window("main") {
        #[cfg(target_os = "windows")]
        if let Ok(hwnd) = window.hwnd() {
          clear_window_title_bar_icon(hwnd);
        }
      }

      // Pré-cache em disco só manual (Configurações) — evita competir com a UI no arranque.
      let show_item = MenuItem::with_id(app, "tray_show", "Mostrar janela", true, None::<&str>)?;
      let hide_item = MenuItem::with_id(app, "tray_hide", "Ocultar janela", true, None::<&str>)?;
      let quit_item = MenuItem::with_id(app, "tray_quit", "Sair", true, None::<&str>)?;
      let tray_menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

      let app_handle = app.handle().clone();
      let mut tray_builder = TrayIconBuilder::new()
        .menu(&tray_menu)
        .show_menu_on_left_click(false);
      if let Some(icon) = app_icon {
        tray_builder = tray_builder.icon(icon);
      }
      let _tray = tray_builder
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
      #[cfg(target_os = "windows")]
      if matches!(event, WindowEvent::Focused(true)) {
        if let Ok(hwnd) = window.hwnd() {
          clear_window_title_bar_icon(hwnd);
        }
      }

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
    })
    .invoke_handler(tauri::generate_handler![
      ping,
      app_version,
      get_paths,
      add_download_source,
      sync_local_source_catalog,
      sync_all_local_source_catalogs,
      get_download_sources,
      remove_download_source,
      open_catalogs_cache_folder,
      open_external_url,
      search_download_options,
      search_game_catalog,
      resolve_game_genres_batch,
      get_game_detail,
      check_catalog_changes,
      set_default_download_path,
      get_default_download_path,
      set_seed_torrents_enabled,
      get_seed_torrents_enabled,
      get_app_setting,
      set_app_setting,
      get_disk_free_bytes_for_path,
      scan_default_download_path,
      delete_local_library_item,
      sync_download_sources,
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
      resolve_covers_for_titles,
      invalidate_game_cover_local,
      get_cover_precache_status,
      get_cover_cache_stats,
      start_cover_precache,
      stop_cover_precache,
      retry_unresolved_covers,
      get_steam_app_index_status,
      refresh_steam_app_index,
      inspect_library_path,
      inspect_library_paths,
      set_library_game_root,
      launch_setup_from_path,
      is_executable_running_at_path,
      extract_library_folder
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

/// Carrega `.env` na raiz do projeto (dev: `npm run tauri:dev`).
fn load_env_from_cwd() {
  let _ = dotenvy::dotenv();
}

/// Fallback: `%APPDATA%/.../config/.env` se a variável ainda não estiver definida.
fn load_env_from_app_config(app: &tauri::AppHandle) {
  let has_steam_web = std::env::var(crate::config::STEAM_WEB_API_KEY_ENV)
    .map(|value| !value.trim().is_empty())
    .unwrap_or(false);
  if has_steam_web {
    return;
  }
  if let Ok(dir) = app.path().app_config_dir() {
    let path = dir.join(".env");
    if path.is_file() {
      let _ = dotenvy::from_path(&path);
    }
  }
}
