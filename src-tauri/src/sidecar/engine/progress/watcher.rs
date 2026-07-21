use crate::dto::SidecarJobProgressRow;
use std::collections::{HashMap, HashSet};
use tauri::AppHandle;
use tokio::time::{sleep, Duration};

use super::super::jobs::fetch_sidecar_jobs_progress;
use super::super::stall::{kick_stalled_job, StallTracker};
use super::persist::persist_progress_batch;
use super::tick::process_progress_row;

pub fn spawn_sidecar_progress_watcher(app: AppHandle) {
  tauri::async_runtime::spawn(async move {
    let mut last_snapshot: HashMap<String, SidecarJobProgressRow> = HashMap::new();
    let mut stall_state: HashMap<String, StallTracker> = HashMap::new();

    loop {
      sleep(Duration::from_millis(750)).await;

      let rows = match fetch_sidecar_jobs_progress(&app).await {
        Ok(items) => items,
        Err(_) => continue,
      };

      let active_ids: HashSet<String> = rows.iter().map(|row| row.id.clone()).collect();
      last_snapshot.retain(|id, _| active_ids.contains(id));
      stall_state.retain(|id, _| active_ids.contains(id));

      let mut batch_updates: Vec<(String, i64, i64, i64, Option<String>, String)> = Vec::new();
      let mut kick_ids: Vec<String> = Vec::new();
      let mut failover_ids: Vec<String> = Vec::new();

      for row in rows {
        if let Some(tick) = process_progress_row(
          &app,
          row,
          &last_snapshot,
          &mut stall_state,
          &mut kick_ids,
          &mut failover_ids,
        ) {
          batch_updates.push(tick.batch_update);
          last_snapshot.insert(tick.snapshot.id.clone(), tick.snapshot);
        }
      }

      persist_progress_batch(&app, batch_updates);

      for id in kick_ids {
        if let Err(error) = kick_stalled_job(&app, &id).await {
          log::warn!("stall_kick_failed id={id}: {error}");
        }
      }

      for id in failover_ids {
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
          match super::super::super::failover::try_failover_stalled_job(app_clone, id.clone()).await {
            Ok(()) => log::info!("failover_ok id={id}"),
            Err(error) => log::warn!("failover_failed id={id}: {error}"),
          }
        });
      }
    }
  });
}
