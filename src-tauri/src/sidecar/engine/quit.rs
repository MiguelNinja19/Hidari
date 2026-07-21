use crate::db::open_database_connection;
use crate::queue::persist::mark_active_persisted_jobs_paused;
use tauri::AppHandle;

use super::pause::pause_all_active_sidecar_jobs;

/// Pausa downloads ativos e termina a app (evita matar aria2 a meio do torrent).
pub fn graceful_app_quit(app: AppHandle) {
  tauri::async_runtime::spawn(async move {
    if let Err(error) = pause_all_active_sidecar_jobs(app.clone()).await {
      log::warn!("could_not_pause_jobs_on_quit: {error}");
    }
    if let Ok(conn) = open_database_connection(&app) {
      let _ = mark_active_persisted_jobs_paused(&conn);
    }
    app.exit(0);
  });
}
