use crate::dto::SidecarJobProgressRow;
use std::time::Instant;

#[derive(Debug, Clone)]
pub(crate) struct StallTracker {
  pub last_progress: f64,
  pub last_bytes: i64,
  pub last_change: Instant,
  pub kick_count: u32,
  pub last_kick: Option<Instant>,
  pub recovering: bool,
  pub failover_started: bool,
}

pub(super) fn finished_transfer(row: &SidecarJobProgressRow, progress: f64) -> bool {
  let finished = row.total_bytes >= 5 * 1024 * 1024
    && row.bytes_downloaded >= row.total_bytes
    && row.total_bytes > 0;
  finished || progress >= 99.5
}

pub(super) fn clear_soft_error(was: Option<StallTracker>) -> Option<String> {
  if was.map(|t| t.recovering || t.kick_count > 0).unwrap_or(false) {
    Some(String::new())
  } else {
    None
  }
}

pub(super) fn handle_moved(
  tracker: &mut StallTracker,
  row: &SidecarJobProgressRow,
  progress: f64,
  now: Instant,
) -> Option<String> {
  let was_soft_error = tracker.recovering || tracker.kick_count > 0;
  tracker.last_progress = progress;
  tracker.last_bytes = row.bytes_downloaded;
  tracker.last_change = now;
  tracker.recovering = false;
  tracker.kick_count = 0;
  tracker.last_kick = None;
  if was_soft_error {
    Some(String::new())
  } else {
    None
  }
}
