//! Parsers for each cracker's achievement file format.
//!
//! Each parser takes a file path and returns Vec<UnlockedAchievement>.
//! Returns empty vec on parse failure (malformed file, wrong format, etc.).

pub mod ini;
pub mod json;
pub mod text;

use super::UnlockedAchievement;
use std::path::Path;

/// Detect file format by extension/content and dispatch to the right parser.
pub fn parse_achievement_file(
  path: &Path,
  cracker: super::Cracker,
) -> Vec<UnlockedAchievement> {
  if !path.exists() {
    return Vec::new();
  }

  match cracker {
    super::Cracker::Codex
    | super::Cracker::Rune
    | super::Cracker::OnlineFix
    | super::Cracker::Skidrow
    | super::Cracker::Rld
    | super::Cracker::CreamApi
    | super::Cracker::SmartSteamEmu => ini::parse_ini_achievements(path),

    super::Cracker::Goldberg
    | super::Cracker::Empress
    | super::Cracker::Steam => json::parse_json_achievements(path),

    super::Cracker::ThreeDM => Vec::new(), // Binary format — TODO
    super::Cracker::Flt => Vec::new(), // Directory listing — TODO
    super::Cracker::Razor1911 => text::parse_text_achievements(path),
  }
}
