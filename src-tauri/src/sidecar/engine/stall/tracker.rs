use crate::dto::SidecarJobProgressRow;
use std::collections::HashMap;
use std::time::Instant;

use super::constants::STALL_MSG_RECOVERING;
use super::stalled::handle_stalled;
use super::types::{clear_soft_error, finished_transfer, handle_moved, StallTracker};

pub(crate) fn update_stall_tracker(
  stall_state: &mut HashMap<String, StallTracker>,
  row: &SidecarJobProgressRow,
  progress: f64,
  kick_ids: &mut Vec<String>,
  failover_ids: &mut Vec<String>,
) -> Option<String> {
  let active = matches!(row.status.as_str(), "downloading" | "retrying");
  if !active {
    // Auto-kick pause/resume briefly marks the job as paused — keep the tracker
    // so kick_count does not reset to 0 on every attempt.
    if row.status.eq_ignore_ascii_case("paused") {
      if let Some(tracker) = stall_state.get_mut(&row.id) {
        if tracker.recovering {
          return Some(STALL_MSG_RECOVERING.to_string());
        }
      }
    }
    stall_state.remove(&row.id);
    return None;
  }

  if finished_transfer(row, progress) {
    let was = stall_state.remove(&row.id);
    return clear_soft_error(was);
  }

  let now = Instant::now();
  let speed = row.speed_bps.max(0);
  let tracker = stall_state.entry(row.id.clone()).or_insert_with(|| StallTracker {
    last_progress: progress,
    last_bytes: row.bytes_downloaded,
    last_change: now,
    kick_count: 0,
    last_kick: None,
    recovering: false,
    failover_started: false,
  });

  let moved = speed > 0
    || (progress - tracker.last_progress).abs() >= 0.2
    || row.bytes_downloaded > tracker.last_bytes;

  if moved {
    return handle_moved(tracker, row, progress, now);
  }

  handle_stalled(tracker, row, now, kick_ids, failover_ids)
}
