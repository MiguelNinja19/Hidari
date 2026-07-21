use super::super::*;
use std::path::{Path, PathBuf};

/// FitGirl e similares: instalação em pasta irmã com o nome limpo do jogo.
/// Só testa caminhos candidatos (O(1)) — não lista nem faz scan de toda a pasta de downloads.
pub fn guess_named_sibling_install(title: &str, repack: &Path) -> Option<PathBuf> {
  let parent = repack.parent().filter(|path| path.is_dir())?;
  let cleaned = title::clean_title_for_matching(title);
  let trimmed = title.trim();
  let mut candidates = Vec::with_capacity(2);
  if !cleaned.is_empty() {
    candidates.push(parent.join(&cleaned));
  }
  if !trimmed.is_empty() && trimmed != cleaned {
    candidates.push(parent.join(trimmed));
  }

  for candidate in candidates {
    if !candidate.is_dir() || candidate == *repack {
      continue;
    }
    #[cfg(target_os = "macos")]
    if folder_has_playable_game_mac_depth(title, &candidate, SCAN_DEPTH_FAST) {
      return Some(candidate);
    }
    #[cfg(not(target_os = "macos"))]
    if folder_has_playable_game_exe_depth(title, &candidate, SCAN_DEPTH_FAST) {
      return Some(candidate);
    }
  }
  None
}
