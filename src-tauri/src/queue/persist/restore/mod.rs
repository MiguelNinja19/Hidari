mod create;
mod identity;
mod rehydrate;
mod resume;
mod setup;
mod skip;

use tauri::AppHandle;

use rehydrate::rehydrate_persisted_job;
use setup::load_restore_context;

/// Rehydrate sidecar queue from SQLite after engine restart (keeps .aria2 / partial files).
pub async fn restore_persisted_queue_jobs(app: AppHandle) {
  let Some((port, client, persisted, mut live_keys)) = load_restore_context(app.clone()).await
  else {
    return;
  };

  for job in persisted {
    rehydrate_persisted_job(&app, &client, port, job, &mut live_keys).await;
  }

  // Jobs que já estavam no sidecar como paused (fecho da app) → retomar.
  resume::resume_paused_sidecar_jobs(&client, port).await;
}
