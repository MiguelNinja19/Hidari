use super::super::*;
use std::{fs, path::PathBuf};

/// Resolve a pasta do próprio job/jogo. Não varre a biblioteca de downloads inteira.
pub fn resolve_game_content_root(title: &str, dest_path: &str) -> PathBuf {
  let base = resolve_job_folder(dest_path);

  #[cfg(target_os = "macos")]
  if folder_has_playable_game_mac_depth(title, &base, SCAN_DEPTH_FAST) {
    return base;
  }

  if folder_has_playable_game_exe_depth(title, &base, SCAN_DEPTH_FAST)
    || folder_has_install_or_game(title, &base)
  {
    return base;
  }

  let tokens = title::tokenize_title(title);
  let Ok(entries) = fs::read_dir(&base) else {
    return base;
  };

  let mut title_match: Option<PathBuf> = None;
  let mut best_score = 0usize;
  let mut setup_dirs: Vec<PathBuf> = Vec::new();
  for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_dir() {
      continue;
    }
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
      continue;
    };
    if is_utility_subfolder(name) {
      continue;
    }
    if is_usable_setup_file(&path.join("setup.exe")) {
      setup_dirs.push(path.clone());
    }
    let name_lower = name.to_lowercase();
    let matched_tokens = tokens
      .iter()
      .filter(|token| name_lower.contains(*token))
      .count();
    if matched_tokens == 0 {
      continue;
    }
    if matched_tokens > best_score {
      best_score = matched_tokens;
      title_match = Some(path);
    }
  }

  if let Some(path) = title_match {
    return path;
  }

  if setup_dirs.len() == 1 {
    return setup_dirs.remove(0);
  }

  if setup_dirs.len() > 1 && !tokens.is_empty() {
    for dir in setup_dirs {
      let name_lower = dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();
      if tokens.iter().any(|token| name_lower.contains(token)) {
        return dir;
      }
    }
  }

  base
}
