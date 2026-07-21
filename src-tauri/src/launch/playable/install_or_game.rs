use super::super::*;
use std::{fs, path::Path};

/// Cross-platform playable check (Mach-O / `.app` on macOS, PE on other OS).
pub fn folder_has_playable_game(title: &str, folder: &Path) -> bool {
  #[cfg(target_os = "macos")]
  {
    return folder_has_playable_game_mac(title, folder);
  }
  #[cfg(not(target_os = "macos"))]
  {
    folder_has_playable_game_exe(title, folder)
  }
}

pub(crate) fn folder_has_install_or_game(title: &str, folder: &Path) -> bool {
  #[cfg(target_os = "macos")]
  if folder_has_playable_game_mac_depth(title, folder, SCAN_DEPTH_FAST) {
    return true;
  }

  let direct_setup = folder.join("setup.exe");
  if is_usable_setup_file(&direct_setup) {
    return true;
  }

  let title_tokens = title::tokenize_title(title);
  let Ok(entries) = fs::read_dir(folder) else {
    return false;
  };

  for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_file() {
      continue;
    }
    let is_exe = path
      .extension()
      .and_then(|ext| ext.to_str())
      .map(|ext| ext.eq_ignore_ascii_case("exe"))
      .unwrap_or(false);
    if !is_exe || !is_probably_executable(&path) {
      continue;
    }
    let file_name = path
      .file_name()
      .and_then(|value| value.to_str())
      .unwrap_or_default();
    if is_blocked_installer_exe(file_name) {
      continue;
    }
    if is_likely_game_exe(file_name) {
      return true;
    }
    let file_lower = file_name.to_lowercase();
    if title_tokens.iter().any(|token| file_lower.contains(token)) {
      return true;
    }
  }

  false
}
