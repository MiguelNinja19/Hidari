//! Scan a Steam install for all installed games.

use super::appmanifest::parse_acf_file;
use super::library_folders::parse_library_folders;
use super::install_path::{detect_steam_install_path, get_steam_user_ids};
use super::{ScanResult, SteamInstall};
use std::path::Path;

/// Detect Steam installation: path, user IDs, and library folders.
/// Returns None if Steam is not installed.
pub fn detect_steam_install() -> Option<SteamInstall> {
  let steam_path = detect_steam_install_path()?;
  let user_ids = get_steam_user_ids(&steam_path);
  let library_folders = parse_library_folders(&steam_path);
  Some(SteamInstall {
    path: steam_path.to_string_lossy().to_string(),
    user_ids,
    library_folders,
  })
}

/// Scan all Steam library folders for installed games.
/// Returns manifests for every `appmanifest_*.acf` found.
pub fn scan_steam_library(steam_install: &SteamInstall) -> ScanResult {
  let mut manifests = Vec::new();
  let mut scanned = Vec::new();

  for library_folder in &steam_install.library_folders {
    let steamapps = Path::new(library_folder).join("steamapps");
    if !steamapps.is_dir() {
      continue;
    }
    scanned.push(library_folder.clone());

    if let Ok(entries) = std::fs::read_dir(&steamapps) {
      for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.starts_with("appmanifest_") && name_str.ends_with(".acf") {
          if let Ok(m) = parse_acf_file(&entry.path(), library_folder) {
            manifests.push(m);
          }
        }
      }
    }
  }

  // Sort by name for stable display
  manifests.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

  ScanResult {
    manifests,
    scanned_libraries: scanned,
  }
}

/// Scan Steam and return only manifests (convenience function).
pub fn scan_all() -> Option<ScanResult> {
  let install = detect_steam_install()?;
  Some(scan_steam_library(&install))
}
