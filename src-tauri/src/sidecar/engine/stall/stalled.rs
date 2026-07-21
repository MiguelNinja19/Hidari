use crate::dto::SidecarJobProgressRow;
use std::time::Instant;

use super::constants::{
  STALL_AFTER, STALL_KICK_COOLDOWN, STALL_MAX_KICKS_BEFORE_FAILOVER, STALL_MSG_FAILOVER,
  STALL_MSG_RECOVERING, STALL_RETRY_COOLDOWN,
};
use super::types::StallTracker;

pub(super) fn handle_stalled(
  tracker: &mut StallTracker,
  row: &SidecarJobProgressRow,
  now: Instant,
  kick_ids: &mut Vec<String>,
  failover_ids: &mut Vec<String>,
) -> Option<String> {
  let stalled_for = now.duration_since(tracker.last_change);
  if stalled_for < STALL_AFTER {
    return if tracker.recovering {
      Some(STALL_MSG_RECOVERING.to_string())
    } else {
      None
    };
  }

  let cooldown = if tracker.kick_count < STALL_MAX_KICKS_BEFORE_FAILOVER {
    STALL_KICK_COOLDOWN
  } else {
    STALL_RETRY_COOLDOWN
  };
  let can_kick = tracker
    .last_kick
    .map(|t| now.duration_since(t) >= cooldown)
    .unwrap_or(true);

  if !can_kick {
    return Some(STALL_MSG_RECOVERING.to_string());
  }

  // After the first burst of kicks, try switching source once — then keep kicking forever.
  if tracker.kick_count >= STALL_MAX_KICKS_BEFORE_FAILOVER && !tracker.failover_started {
    tracker.failover_started = true;
    tracker.recovering = true;
    tracker.last_kick = Some(now);
    tracker.last_change = now;
    failover_ids.push(row.id.clone());
    log::info!("stall_failover id={}", row.id);
    return Some(STALL_MSG_FAILOVER.to_string());
  }

  tracker.kick_count = tracker.kick_count.saturating_add(1);
  tracker.last_kick = Some(now);
  tracker.recovering = true;
  tracker.last_change = now;
  kick_ids.push(row.id.clone());
  log::info!(
    "stall_kick id={} attempt={} (auto-resume, never give up)",
    row.id,
    tracker.kick_count
  );
  Some(STALL_MSG_RECOVERING.to_string())
}
