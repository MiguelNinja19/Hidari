use super::super::*;
use std::path::PathBuf;

/// Pasta deste job/jogo apenas — sem irmãos, sem varrer a pasta de downloads.
pub fn resolve_game_content_root(_title: &str, dest_path: &str) -> PathBuf {
  resolve_job_folder(dest_path)
}
