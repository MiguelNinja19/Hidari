use super::super::*;
use std::{fs, path::Path};

pub(crate) fn score_executable_candidate(
  path: &Path,
  depth: usize,
  title_tokens: &[String],
) -> i64 {
  let file_name = path
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or_default()
    .to_lowercase();

  let mut score = 0i64;
  score -= (depth as i64) * 40;

  let size_mb = fs::metadata(path)
    .map(|meta| meta.len() / (1024 * 1024))
    .unwrap_or(0) as i64;
  if (2..=800).contains(&size_mb) {
    score += 120;
  } else if size_mb < 1 {
    score -= 20;
  } else if size_mb > 800 {
    score -= 40;
  }

  if file_name.contains("win64-shipping") || file_name.contains("-shipping.exe") {
    score += 600;
  }
  if file_name == "game.exe" || file_name.ends_with("-game.exe") {
    score += 350;
  }
  if matches!(
    stem_of_exe(&file_name),
    "launcher" | "gamelauncher" | "start" | "run" | "play"
  ) {
    score -= 500;
  }

  for token in title_tokens {
    if file_name.contains(token) {
      score += 450;
    }
  }

  if let Some(parent) = path
    .parent()
    .and_then(|dir| dir.file_name())
    .and_then(|name| name.to_str())
  {
    let parent_lower = parent.to_lowercase();
    for token in title_tokens {
      if parent_lower.contains(token) {
        score += 180;
      }
    }
    if parent_lower == "bin" || parent_lower == "binaries" || parent_lower == "game" {
      score += 80;
    }
  }

  let path_lower = path.to_string_lossy().to_lowercase();
  for blocked_dir in [
    "redist",
    "_redist",
    "directx",
    "dotnet",
    "support",
    "tools",
    "extras",
    "bonus",
    "optional",
    "__installer",
    "md5",
  ] {
    if path_lower.contains(&format!("\\{blocked_dir}\\"))
      || path_lower.contains(&format!("/{blocked_dir}/"))
    {
      score -= 250;
    }
  }

  score
}
