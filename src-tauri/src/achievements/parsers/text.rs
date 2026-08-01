//! Plain-text parser for Razor1911 stats.txt format.
//!
//! Format (space-separated, one achievement per line):
//! ```
//! ACH_001 1 1609459200
//! ACH_002 0 0
//! ACH_003 1 1609545600
//! ```
//! Field 1 = achievement ID, Field 2 = unlocked (1/0), Field 3 = unlock timestamp.

use super::super::UnlockedAchievement;
use std::path::Path;

pub fn parse_text_achievements(path: &Path) -> Vec<UnlockedAchievement> {
  let content = match std::fs::read_to_string(path) {
    Ok(c) => c,
    Err(_) => return Vec::new(),
  };

  let mut result = Vec::new();
  for line in content.lines() {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 2 {
      continue;
    }
    let name = parts[0].to_string();
    let unlocked = parts[1] == "1" || parts[1].eq_ignore_ascii_case("true");
    if !unlocked {
      continue;
    }
    let unlock_time = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
    result.push(UnlockedAchievement {
      name,
      unlock_time,
      hardcore_unlock_time: 0,
    });
  }

  result
}
