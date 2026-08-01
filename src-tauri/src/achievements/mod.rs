//! Achievements backend.
//!
//! Scans for unlocked achievements across 12+ cracker save file formats.
//! Purely local, no network calls (catalogue/metadata fetched separately).
//!
//! Inspired by Hydra Launcher's `src/main/services/achievements/` but
//! reimplemented in Rust without the cracker-specific complexity.

pub mod cracker_paths;
pub mod parsers;
pub mod memory_store;
pub mod commands;

use serde::{Deserialize, Serialize};

/// A cracker/emulator format we know how to scan.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Cracker {
  Codex,
  Goldberg,
  Rune,
  OnlineFix,
  Skidrow,
  Rld,
  Empress,
  ThreeDM,
  Flt,
  Razor1911,
  CreamApi,
  SmartSteamEmu,
  Steam,
}

impl Cracker {
  pub fn all() -> &'static [Cracker] {
    &[
      Cracker::Codex,
      Cracker::Goldberg,
      Cracker::Rune,
      Cracker::OnlineFix,
      Cracker::Skidrow,
      Cracker::Rld,
      Cracker::Empress,
      Cracker::ThreeDM,
      Cracker::Flt,
      Cracker::Razor1911,
      Cracker::CreamApi,
      Cracker::SmartSteamEmu,
      Cracker::Steam,
    ]
  }

  pub fn label(&self) -> &'static str {
    match self {
      Cracker::Codex => "CODEX",
      Cracker::Goldberg => "Goldberg",
      Cracker::Rune => "RUNE",
      Cracker::OnlineFix => "OnlineFix",
      Cracker::Skidrow => "Skidrow",
      Cracker::Rld => "RLD!",
      Cracker::Empress => "Empress",
      Cracker::ThreeDM => "3DM",
      Cracker::Flt => "FLT",
      Cracker::Razor1911 => "Razor1911",
      Cracker::CreamApi => "CreamAPI",
      Cracker::SmartSteamEmu => "SmartSteamEmu",
      Cracker::Steam => "Steam",
    }
  }
}

/// A single unlocked achievement entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnlockedAchievement {
  /// Internal achievement ID (e.g., "ACH_001" or "NEW_ACHIEVEMENT_NAME").
  pub name: String,
  /// Unix timestamp (seconds) when unlocked. 0 if unknown.
  pub unlock_time: i64,
  /// Hardcore mode unlock time (RetroAchievements only). 0 if N/A.
  #[serde(default)]
  pub hardcore_unlock_time: i64,
}

/// Full achievement data for a game.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AchievementData {
  /// Catalogue of all possible achievements (from Steam/Hydra API).
  pub achievements: Vec<Achievement>,
  /// Achievements the user has unlocked (from cracker save files).
  pub unlocked: Vec<UnlockedAchievement>,
  /// Which cracker the unlocks came from.
  pub source: Option<String>,
}

/// Catalogue entry for an achievement (icon, name, description, etc.).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Achievement {
  pub id: String,
  pub display_name: String,
  pub description: String,
  pub icon_url: Option<String>,
  pub icongray_url: Option<String>,
  pub hidden: bool,
  pub points: u32,
  #[serde(default)]
  pub is_platinum: bool,
}

/// Result of scanning a game for achievements.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScanAchievementsResult {
  pub object_id: String,
  pub shop: String,
  pub unlocked: Vec<UnlockedAchievement>,
  pub source: Option<String>,
  pub scanned_paths: Vec<String>,
}
