use crate::queue::{persist::restore_persisted_queue_jobs, startup_queue_recovery};
use crate::sidecar::{
  spawn_download_engine, spawn_extraction_watcher, spawn_sidecar_progress_watcher,
};
use tauri::AppHandle;

pub fn start_background_workers(app: &AppHandle) {
  startup_queue_recovery(app);
  spawn_download_engine(app.clone());
  let restore_app = app.clone();
  tauri::async_runtime::spawn(async move {
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
  spawn_sidecar_progress_watcher(app.clone());
  spawn_extraction_watcher(app.clone());
  crate::library::watcher::spawn_download_folder_watcher(app.clone());
  crate::covers::maybe_refresh_steam_app_index(app);
  let warm_handle = app.clone();
  std::thread::spawn(move || {
    crate::sources::hydralinks::warm_local_catalog_caches(&warm_handle);
  });
}
