//! Detect Steam install path across platforms.
//!
//! - Windows: read `HKCU\Software\Valve\Steam\SteamPath` from registry.
//! - Linux: probe `~/.steam/steam` and `~/.local/share/Steam`.
//! - macOS: probe `~/Library/Application Support/Steam`.

use std::path::PathBuf;

/// Find Steam install path on the current platform.
/// Returns None if Steam is not installed or cannot be found.
pub fn detect_steam_install_path() -> Option<PathBuf> {
  // 1. Check env var override
  if let Ok(path) = std::env::var("STEAM_PATH") {
    let p = PathBuf::from(path);
    if p.is_dir() {
      return Some(p);
    }
  }

  // 2. Platform-specific probing
  #[cfg(target_os = "windows")]
  {
    if let Some(p) = detect_windows_steam_path() {
      return Some(p);
    }
  }

  #[cfg(target_os = "linux")]
  {
    if let Some(p) = detect_linux_steam_path() {
      return Some(p);
    }
  }

  #[cfg(target_os = "macos")]
  {
    if let Some(p) = detect_macos_steam_path() {
      return Some(p);
    }
  }

  None
}

#[cfg(target_os = "windows")]
fn detect_windows_steam_path() -> Option<PathBuf> {
  // Try registry: HKCU\Software\Valve\Steam\SteamPath
  // The `winreg` crate is already a dependency of Hidari on Windows.
  use winreg::enums::*;
  use winreg::RegKey;
  let hkcu = RegKey::predef(HKEY_CURRENT_USER);
  let steam = hkcu.open_subkey("Software\\Valve\\Steam").ok()?;
  let path: String = steam.get_value("SteamPath").ok()?;
  let p = PathBuf::from(path);
  if p.is_dir() {
    Some(p)
  } else {
    None
  }
}

#[cfg(target_os = "linux")]
fn detect_linux_steam_path() -> Option<PathBuf> {
  let home = std::env::var("HOME").ok()?;
  let candidates = [
    format!("{home}/.steam/steam"),
    format!("{home}/.local/share/Steam"),
    format!("{home}/.var/app/com.valvesoftware.Steam/data/Steam"), // Flatpak
  ];
  for c in candidates {
    let p = PathBuf::from(&c);
    if p.is_dir() {
      return Some(p);
    }
  }
  None
}

#[cfg(target_os = "macos")]
fn detect_macos_steam_path() -> Option<PathBuf> {
  let home = std::env::var("HOME").ok()?;
  let p = PathBuf::from(format!("{home}/Library/Application Support/Steam"));
  if p.is_dir() {
    Some(p)
  } else {
    None
  }
}

/// Get the list of Steam user IDs by scanning `<steam_path>/userdata/`.
pub fn get_steam_user_ids(steam_path: &std::path::Path) -> Vec<String> {
  let userdata = steam_path.join("userdata");
  let mut ids = Vec::new();
  if let Ok(entries) = std::fs::read_dir(&userdata) {
    for entry in entries.flatten() {
      if let Ok(ft) = entry.file_type() {
        if ft.is_dir() {
          let name = entry.file_name();
          let name_str = name.to_string_lossy();
          // Steam user IDs are numeric
          if name_str.chars().all(|c| c.is_ascii_digit()) && !name_str.is_empty() {
            ids.push(name_str.to_string());
          }
        }
      }
    }
  }
  ids
}
