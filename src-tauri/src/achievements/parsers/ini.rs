//! INI parser for achievement files.
//!
//! CODEX/RUNE/OnlineFix/Skidrow/RLD/CreamAPI/SmartSteamEmu all use INI format:
//!
//! ```ini
//! [Achievements]
//! ACH_001=1
//! ACH_002=1
//! ACH_003=0
//! ...
//!
//! [Achievements timestamps]
//! ACH_001=1609459200
//! ACH_002=1609545600
//! ```
//! A value of `1` means unlocked; `0` means still locked.

use super::super::UnlockedAchievement;
use std::collections::HashMap;
use std::path::Path;

pub fn parse_ini_achievements(path: &Path) -> Vec<UnlockedAchievement> {
  let content = match std::fs::read_to_string(path) {
    Ok(c) => c,
    Err(_) => return Vec::new(),
  };

  let mut current_section = String::new();
  let mut unlocked_map: HashMap<String, bool> = HashMap::new();
  let mut timestamps_map: HashMap<String, i64> = HashMap::new();

  for line in content.lines() {
    let line = line.trim();
    if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
      continue;
    }
    if line.starts_with('[') && line.ends_with(']') {
      current_section = line[1..line.len() - 1].to_string();
      continue;
    }
    if let Some(eq_pos) = line.find('=') {
      let key = line[..eq_pos].trim().to_string();
      let value = line[eq_pos + 1..].trim();
      let lower_section = current_section.to_lowercase();
      if lower_section.contains("timestamp") {
        if let Ok(ts) = value.parse::<i64>() {
          timestamps_map.insert(key, ts);
        }
      } else if lower_section.contains("achievement") {
        // Value 1 = unlocked, 0 = locked
        let is_unlocked = value == "1" || value.eq_ignore_ascii_case("true");
        unlocked_map.insert(key, is_unlocked);
      }
    }
  }

  let mut result = Vec::new();
  for (name, is_unlocked) in unlocked_map {
    if is_unlocked {
      let unlock_time = timestamps_map.get(&name).copied().unwrap_or(0);
      result.push(UnlockedAchievement {
        name,
        unlock_time,
        hardcore_unlock_time: 0,
      });
    }
  }

  // Sort by name for stable output
  result.sort_by(|a, b| a.name.cmp(&b.name));
  result
}
