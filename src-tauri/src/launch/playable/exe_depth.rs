use super::super::*;
use std::path::{Path, PathBuf};

pub(crate) fn folder_has_playable_game_exe_depth(
  title: &str,
  folder: &Path,
  max_depth: usize,
) -> bool {
  if !folder.is_dir() {
    return false;
  }

  let title_tokens = title::tokenize_title(title);
  let mut local: Vec<(usize, PathBuf)> = Vec::new();
  collect_executable_candidates(folder, 0, max_depth, &mut local);

  for (depth, path) in local {
    if !is_probably_executable(&path) {
      continue;
    }
    let file_name = path
      .file_name()
      .and_then(|value| value.to_str())
      .unwrap_or_default();
    if is_blocked_installer_exe(file_name)
      || is_store_or_platform_launcher_exe(file_name, &path)
    {
      continue;
    }
    if !is_likely_game_exe(file_name) {
      continue;
    }
    if !path_matches_title_tokens(&path, &title_tokens) {
      continue;
    }
    if score_executable_candidate(&path, depth, &title_tokens) > 0 {
      return true;
    }
  }

  false
}

pub fn folder_has_playable_game_exe(title: &str, folder: &Path) -> bool {
  folder_has_playable_game_exe_depth(title, folder, SCAN_DEPTH_FAST)
    || folder_has_playable_game_exe_depth(title, folder, SCAN_DEPTH_FULL)
}
