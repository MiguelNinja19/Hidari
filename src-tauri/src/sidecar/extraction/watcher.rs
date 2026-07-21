use crate::db::open_database_connection;
use crate::state::ExtractionState;
use tauri::{AppHandle, Manager};
use tokio::time::{sleep, Duration};

pub fn spawn_extraction_watcher(app: AppHandle) {
  tauri::async_runtime::spawn(async move {
    loop {
      sleep(Duration::from_secs(4)).await;
      let jobs = match super::list_sidecar_jobs_for_watcher(&app).await {
        Ok(items) => items,
        Err(_) => continue,
      };
      if open_database_connection(&app).is_err() {
        continue;
      }
      let extraction: tauri::State<'_, ExtractionState> = app.state();
      if !extraction.try_acquire() {
        continue;
      }
      let mut started = false;
      for job in jobs {
        if super::start_job_if_ready(&app, job).await {
          started = true;
          break;
        }
      }
      if !started {
        extraction.release();
      }
    }
  });
}
