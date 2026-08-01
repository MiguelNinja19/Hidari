//! Steam integration backend.
//!
//! Detects Steam install path (multi-platform), parses appmanifest_*.acf
//! files, scans steamapps/common for installed games, and imports them
//! into the Hidari library.
//!
//! Inspired by Hydra Launcher's `src/main/services/steam.ts` but
//! reimplemented in pure Rust (no external crates needed beyond std).

pub mod install_path;
pub mod appmanifest;
pub mod library_folders;
pub mod scan;
pub mod commands;

use serde::{Deserialize, Serialize};

/// Detected Steam installation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamInstall {
  /// Root Steam directory (e.g. `C:\Program Files (x86)\Steam`).
  pub path: String,
  /// List of Steam user IDs found in `userdata/` (numeric strings).
  pub user_ids: Vec<String>,
  /// All Steam library folders (from `libraryfolders.vdf`).
  pub library_folders: Vec<String>,
}

/// A Steam app manifest parsed from `appmanifest_<appid>.acf`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppManifest {
  pub appid: String,
  pub name: String,
  pub installdir: String,
  pub size_on_disk: u64,
  pub last_updated: i64,
  pub buildid: String,
  /// Absolute path to the game install folder (`<library>/steamapps/common/<installdir>`).
  pub install_path: String,
  /// The library folder this game belongs to.
  pub library_folder: String,
}

/// Result of a scan: list of manifests + library folders scanned.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
  pub manifests: Vec<AppManifest>,
  pub scanned_libraries: Vec<String>,
}

/// Result of importing scanned games into the Hidari library.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
  pub imported_count: usize,
  pub skipped_count: usize,
  pub errors: Vec<String>,
}
