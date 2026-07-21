use crate::config;

fn percent_encode_tracker(tracker: &str) -> String {
  let mut out = String::with_capacity(tracker.len() + 8);
  for byte in tracker.bytes() {
    match byte {
      b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
        out.push(byte as char);
      }
      _ => out.push_str(&format!("%{byte:02X}")),
    }
  }
  out
}

/// Adds public trackers (and optional display name) to magnet links with few trackers.
pub fn enrich_magnet_url(raw: &str) -> String {
  enrich_magnet_url_with_title(raw, None)
}

pub fn enrich_magnet_url_with_title(raw: &str, display_name: Option<&str>) -> String {
  if !raw.to_ascii_lowercase().starts_with("magnet:?") {
    return raw.to_string();
  }

  let lower = raw.to_lowercase();
  let tracker_count = lower.matches("&tr=").count() + if lower.contains("?tr=") { 1 } else { 0 };

  let mut enriched = raw.to_string();

  if let Some(name) = display_name.map(str::trim).filter(|n| !n.is_empty()) {
    if !lower.contains("dn=") {
      enriched.push_str("&dn=");
      enriched.push_str(&percent_encode_tracker(name));
    }
  }

  if tracker_count >= 10 {
    return enriched;
  }

  let enriched_lower = enriched.to_lowercase();
  for tracker in config::DEFAULT_MAGNET_TRACKERS {
    if enriched_lower.contains(&tracker.to_lowercase()) {
      continue;
    }
    enriched.push_str("&tr=");
    enriched.push_str(&percent_encode_tracker(tracker));
  }
  enriched
}
