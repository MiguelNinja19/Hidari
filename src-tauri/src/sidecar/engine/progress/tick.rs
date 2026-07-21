use crate::dto::{JobProgressEvent, QUEUE_EVENT_JOB_PROGRESS, SidecarJobProgressRow};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

use super::normalize::normalize_sidecar_progress;
use super::super::stall::{update_stall_tracker, StallTracker};

pub(crate) struct TickOutput {
  pub batch_update: (String, i64, i64, i64, Option<String>, String),
  pub snapshot: SidecarJobProgressRow,
}

pub(crate) fn process_progress_row(
  app: &AppHandle,
  row: SidecarJobProgressRow,
  last_snapshot: &HashMap<String, SidecarJobProgressRow>,
  stall_state: &mut HashMap<String, StallTracker>,
  kick_ids: &mut Vec<String>,
  failover_ids: &mut Vec<String>,
) -> Option<TickOutput> {
  let progress = normalize_sidecar_progress(
    row.progress,
    row.bytes_downloaded,
    row.total_bytes,
    &row.status,
  );

  let stall_hint = update_stall_tracker(stall_state, &row, progress, kick_ids, failover_ids);

  let changed = last_snapshot.get(&row.id).map_or(true, |prev| {
    let prev_progress = normalize_sidecar_progress(
      prev.progress,
      prev.bytes_downloaded,
      prev.total_bytes,
      &prev.status,
    );
    let bytes_delta = (row.bytes_downloaded - prev.bytes_downloaded).abs();
    prev.status != row.status
      || prev.error_msg != row.error_msg
      || (prev_progress - progress).abs() >= 0.5
      || bytes_delta >= 1_048_576
      || prev.total_bytes != row.total_bytes
      || stall_hint.is_some()
  });
  if !changed {
    return None;
  }

  let error_msg = match stall_hint {
    Some(msg) => Some(msg),
    None => row.error_msg.clone(),
  };

  let _ = app.emit(
    QUEUE_EVENT_JOB_PROGRESS,
    JobProgressEvent {
      job_id: row.id.clone(),
      progress,
      status: row.status.clone(),
      speed_bytes_per_sec: row.speed_bps.max(0) as u64,
      eta_seconds: row.eta_seconds.max(0),
      bytes_downloaded: Some(row.bytes_downloaded),
      total_bytes: Some(row.total_bytes),
      error_msg: error_msg.clone(),
    },
  );

  Some(TickOutput {
    batch_update: (
      row.status.clone(),
      progress.round() as i64,
      row.bytes_downloaded,
      row.total_bytes,
      error_msg,
      row.id.clone(),
    ),
    snapshot: row,
  })
}
