use super::extensions::{is_archive_extension, is_payload_extension};
use std::path::{Path, PathBuf};

const DOWNLOAD_SCAN_MAX_DEPTH: u32 = 4;

pub(crate) fn resolve_job_folder(dest_path: &str) -> PathBuf {
  let path = PathBuf::from(dest_path);
  if path.is_dir() {
    path
  } else {
    path.parent().map(Path::to_path_buf).unwrap_or(path)
  }
}

fn should_skip_scan_dir(name: &str) -> bool {
  name.starts_with('.') || name.eq_ignore_ascii_case("$recycle.bin")
}

pub(crate) fn walk_download_candidates(
  folder: &Path,
  depth: u32,
  archives: &mut Vec<(u64, PathBuf)>,
  payloads: &mut Vec<(u64, PathBuf)>,
) {
  if depth > DOWNLOAD_SCAN_MAX_DEPTH {
    return;
  }
  let Ok(entries) = std::fs::read_dir(folder) else {
    return;
  };
  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_file() {
      let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
      if is_archive_extension(&path) {
        archives.push((size, path));
      } else if is_payload_extension(&path) {
        payloads.push((size, path));
      }
    } else if path.is_dir() {
      let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
      if should_skip_scan_dir(name) {
        continue;
      }
      walk_download_candidates(&path, depth + 1, archives, payloads);
    }
  }
}
