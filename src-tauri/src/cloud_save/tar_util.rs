//! Tar utilities — create and extract tar archives of save folders.

use super::CloudSaveError;
use std::fs::File;
use std::path::Path;

/// Create a tar archive from a source folder.
/// The tar will contain the relative structure (no leading `/`).
pub fn create_tar(source_dir: &Path, tar_path: &Path) -> Result<u64, CloudSaveError> {
  let tar_file = File::create(tar_path)?;
  let mut builder = tar::Builder::new(tar_file);

  // Walk the source directory recursively
  let base_name = source_dir
    .file_name()
    .map(|n| n.to_string_lossy().to_string())
    .unwrap_or_else(|| "save".to_string());

  builder.append_dir_all(&base_name, source_dir)?;
  builder.finish()?;

  let size = std::fs::metadata(tar_path)?.len();
  Ok(size)
}

/// Extract a tar archive to a destination folder.
/// The destination folder is created if it doesn't exist.
pub fn extract_tar(tar_path: &Path, dest_dir: &Path) -> Result<(), CloudSaveError> {
  std::fs::create_dir_all(dest_dir)?;
  let tar_file = File::open(tar_path)?;
  let mut archive = tar::Archive::new(tar_file);
  archive.unpack(dest_dir)?;
  Ok(())
}

/// Compute total size of a folder (recursively).
pub fn folder_size(path: &Path) -> u64 {
  let mut total = 0u64;
  if let Ok(entries) = std::fs::read_dir(path) {
    for entry in entries.flatten() {
      if let Ok(ft) = entry.file_type() {
        if ft.is_file() {
          if let Ok(meta) = entry.metadata() {
            total += meta.len();
          }
        } else if ft.is_dir() {
          total += folder_size(&entry.path());
        }
      }
    }
  }
  total
}
