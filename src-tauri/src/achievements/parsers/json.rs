//! JSON parser for achievement files (Goldberg, Empress, Steam cache).
//!
//! Goldberg format (`achievements.json`):
//! ```json
//! [
//!   {"name": "ACH_001", "earned": true, "earned_time": 1609459200},
//!   {"name": "ACH_002", "earned": false, "earned_time": 0}
//! ]
//! ```
//!
//! Steam cache format (`<appid>.json`):
//! ```json
//! {
//!   "vecHighlight": [
//!     {"bAchieved": true, "rtUnlocked": 1609459200, "strID": "ACH_001"},
//!     ...
//!   ]
//! }
//! ```

use super::super::UnlockedAchievement;
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize)]
struct GoldbergEntry {
  name: String,
  #[serde(default)]
  earned: bool,
  #[serde(default)]
  earned_time: i64,
}

#[derive(Deserialize)]
struct SteamCacheFile {
  #[serde(default, rename = "vecHighlight")]
  vec_highlight: Vec<SteamHighlight>,
}

#[derive(Deserialize)]
struct SteamHighlight {
  #[serde(default, rename = "bAchieved")]
  achieved: bool,
  #[serde(default, rename = "rtUnlocked")]
  unlocked_time: i64,
  #[serde(default, rename = "strID")]
  id: String,
}

pub fn parse_json_achievements(path: &Path) -> Vec<UnlockedAchievement> {
  let content = match std::fs::read_to_string(path) {
    Ok(c) => c,
    Err(_) => return Vec::new(),
  };

  // Try Goldberg format first (array of objects)
  if content.trim_start().starts_with('[') {
    if let Ok(entries) = serde_json::from_str::<Vec<GoldbergEntry>>(&content) {
      return entries
        .into_iter()
        .filter(|e| e.earned)
        .map(|e| UnlockedAchievement {
          name: e.name,
          unlock_time: e.earned_time,
          hardcore_unlock_time: 0,
        })
        .collect();
    }
  }

  // Try Steam cache format (object with vecHighlight)
  if let Ok(cache) = serde_json::from_str::<SteamCacheFile>(&content) {
    return cache
      .vec_highlight
      .into_iter()
      .filter(|h| h.achieved)
      .map(|h| UnlockedAchievement {
        name: h.id,
        unlock_time: h.unlocked_time,
        hardcore_unlock_time: 0,
      })
      .collect();
  }

  Vec::new()
}
