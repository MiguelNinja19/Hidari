use super::extensions::{is_archive_extension, is_payload_extension};
use super::volume::prefer_archive_volume;
use super::walk::{resolve_job_folder, walk_download_candidates};
use std::path::PathBuf;

/// Finds the best archive candidate for a job destination path (inclui subpastas de torrent).
pub fn find_job_archive(dest_path: &str) -> Option<PathBuf> {
  let path = PathBuf::from(dest_path);

  if path.is_file() && is_archive_extension(&path) {
    return Some(path);
  }

  let folder = resolve_job_folder(dest_path);
  if !folder.exists() || !folder.is_dir() {
    return None;
  }

  let mut archives = Vec::new();
  let mut payloads = Vec::new();
  walk_download_candidates(&folder, 0, &mut archives, &mut payloads);
  archives.sort_by_key(|a| std::cmp::Reverse(a.0));
  let paths: Vec<PathBuf> = archives.into_iter().map(|(_, p)| p).collect();
  prefer_archive_volume(paths)
}

/// Maior ficheiro útil do download — arquivo ou instalador (procura em subpastas).
pub fn find_download_payload(dest_path: &str) -> Option<PathBuf> {
  let path = PathBuf::from(dest_path);
  if path.is_file() {
    if is_archive_extension(&path) || is_payload_extension(&path) {
      return Some(path);
    }
    return None;
  }

  if let Some(archive) = find_job_archive(dest_path) {
    return Some(archive);
  }

  let folder = resolve_job_folder(dest_path);
  if !folder.is_dir() {
    return None;
  }

  let mut archives = Vec::new();
  let mut payloads = Vec::new();
  walk_download_candidates(&folder, 0, &mut archives, &mut payloads);
  payloads.sort_by_key(|a| std::cmp::Reverse(a.0));
  payloads.into_iter().next().map(|(_, path)| path)
}
