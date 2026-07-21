use crate::dto::SidecarJobProgressRow;
use std::time::Instant;

use super::constants::{
  STALL_AFTER, STALL_AFTER_EARLY, STALL_KICK_COOLDOWN, STALL_MAX_KICKS_BEFORE_FAILOVER,
  STALL_MSG_FAILOVER, STALL_MSG_RECOVERING, STALL_MSG_WAITING_PEERS, STALL_RETRY_COOLDOWN,
};
use super::types::StallTracker;

/// Fase em que pause/resume atrapalha (metadados, peers, follow-torrent).
fn is_early_torrent_phase(row: &SidecarJobProgressRow) -> bool {
  if row.bytes_downloaded > 64 * 1024 {
    return false;
  }
  if row.total_bytes <= 0 {
    return true;
  }
  let msg = row.error_msg.as_deref().unwrap_or("");
  msg.contains("Conectando peers")
    || msg.contains("metadados")
    || msg.contains("Metadados")
    || msg.contains("aguardar conteúdo")
    || msg.contains("conteúdo do torrent")
    || msg.contains("Baixando torrent")
    || msg.contains("A obter o conteúdo")
    || msg.contains("A retomar download")
}

pub(super) fn handle_stalled(
  tracker: &mut StallTracker,
  row: &SidecarJobProgressRow,
  now: Instant,
  kick_ids: &mut Vec<String>,
  failover_ids: &mut Vec<String>,
) -> Option<String> {
  let stalled_for = now.duration_since(tracker.last_change);
  let early = is_early_torrent_phase(row);
  let threshold = if early { STALL_AFTER_EARLY } else { STALL_AFTER };

  if stalled_for < threshold {
    return if tracker.recovering {
      Some(STALL_MSG_RECOVERING.to_string())
    } else if early && stalled_for >= STALL_AFTER {
      Some(STALL_MSG_WAITING_PEERS.to_string())
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
    "stall_kick id={} attempt={} early={} (auto-resume, never give up)",
    row.id,
    tracker.kick_count,
    early
  );
  Some(STALL_MSG_RECOVERING.to_string())
}
