use tauri::AppHandle;

use super::create::{create_restored_sidecar_job, persist_restored_job, restored_identity_key};
use super::skip::should_skip_restore;
use super::super::types::PersistedQueueJob;

pub(super) async fn rehydrate_persisted_job(
  app: &AppHandle,
  client: &reqwest::Client,
  port: u16,
  job: PersistedQueueJob,
  live_keys: &mut std::collections::HashSet<String>,
) {
  if should_skip_restore(app, &job) {
    return;
  }
  let key = restored_identity_key(&job);
  if live_keys.contains(&key) {
    return;
  }

  let Some((new_id, created)) = create_restored_sidecar_job(app, client, port, &job).await else {
    return;
  };

  persist_restored_job(app, &job, &new_id, &created);

  live_keys.insert(key);
  log::info!(
    "restored queue job '{}' as {} (was {})",
    job.title,
    new_id,
    job.status
  );
}
