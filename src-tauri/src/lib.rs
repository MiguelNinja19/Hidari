mod archive;
mod app;
mod catalog;
mod commands;
mod config;
mod covers;
mod db;
mod dto;
mod favorites;
mod launch;
mod launch_errors;
mod library;
mod notifications;
mod path_security;
mod queue;
mod sidecar;
mod sources;
mod state;
mod title;

use app::{configure_app, lifecycle, load_env_from_cwd, setup};
use commands::*;
use covers::CoverPrecacheState;
use state::{ExtractionState, SidecarState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  load_env_from_cwd();

  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      setup::on_second_instance(app, argv);
    }))
    .manage(SidecarState::default())
    .manage(ExtractionState::default())
    .manage(CoverPrecacheState::default())
    .setup(|app| configure_app(app).map_err(Into::into))
    .on_window_event(lifecycle::on_window_event)
    .invoke_handler(app_invoke_handler!())
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
