use std::path::{Path, PathBuf};

const ARCHIVE_EXTENSIONS: &[&str] = &["zip", "7z", "rar", "001", "tar", "gz", "bz2", "xz"];

/// Returns true if the path has a known archive extension.
pub fn is_archive_extension(path: &Path) -> bool {
  let ext = path
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.to_lowercase())
    .unwrap_or_default();
  ARCHIVE_EXTENSIONS.contains(&ext.as_str())
}

fn resolve_job_folder(dest_path: &str) -> PathBuf {
  let path = PathBuf::from(dest_path);
  if path.is_dir() {
    path
  } else {
    path.parent().map(Path::to_path_buf).unwrap_or(path)
  }
}

/// Finds the best archive candidate for a job destination path.
pub fn find_job_archive(dest_path: &str) -> Option<PathBuf> {
  let path = PathBuf::from(dest_path);

  if path.is_file() && is_archive_extension(&path) {
    return Some(path);
  }

  let folder = resolve_job_folder(dest_path);
  if !folder.exists() || !folder.is_dir() {
    return None;
  }

  let mut candidates: Vec<(u64, PathBuf)> = Vec::new();

  let entries = std::fs::read_dir(&folder).ok()?;
  for entry in entries.flatten() {
    let entry_path = entry.path();
    if !entry_path.is_file() {
      continue;
    }
    if !is_archive_extension(&entry_path) {
      continue;
    }
    let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
    candidates.push((size, entry_path));
  }

  candidates.sort_by_key(|a| std::cmp::Reverse(a.0));
  let paths: Vec<PathBuf> = candidates.into_iter().map(|(_, p)| p).collect();
  prefer_archive_volume(paths)
}

fn prefer_archive_volume(paths: Vec<PathBuf>) -> Option<PathBuf> {
  if paths.is_empty() {
    return None;
  }
  for path in &paths {
    let name = path
      .file_name()
      .and_then(|n| n.to_str())
      .unwrap_or("")
      .to_lowercase();
    if name.contains("part001")
      || name.contains(".part1.")
      || name.contains("part01")
      || name.ends_with(".001")
    {
      return Some(path.clone());
    }
  }
  paths.into_iter().next()
}

fn sanitize_folder_name(title: &str) -> String {
  let cleaned: String = title
    .chars()
    .map(|c| {
      if c.is_ascii_alphanumeric() || c == ' ' || c == '-' || c == '_' {
        c
      } else {
        '_'
      }
    })
    .collect();
  let trimmed = cleaned.trim();
  if trimmed.is_empty() {
    "game".to_string()
  } else {
    trimmed.to_string()
  }
}

/// Resolves where extracted files should land.
pub fn resolve_extract_destination(
  title: &str,
  base_dir: &Path,
  install_organization: &str,
) -> PathBuf {
  if install_organization == "single-folder" {
    base_dir.to_path_buf()
  } else {
    base_dir.join(sanitize_folder_name(title))
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use std::io::Write;

  #[test]
  fn is_archive_extension_recognizes_formats() {
    assert!(is_archive_extension(Path::new("game.zip")));
    assert!(is_archive_extension(Path::new("game.7Z")));
    assert!(is_archive_extension(Path::new("part1.rar")));
    assert!(is_archive_extension(Path::new("archive.001")));
    assert!(!is_archive_extension(Path::new("game.exe")));
    assert!(!is_archive_extension(Path::new("readme.txt")));
  }

  #[test]
  fn find_job_archive_picks_largest_in_folder() {
    let dir = std::env::temp_dir().join(format!("launcher_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    let small = dir.join("a.zip");
    let large = dir.join("b.7z");
    let mut f1 = fs::File::create(&small).unwrap();
    f1.write_all(&[0u8; 10]).unwrap();
    f1.sync_all().unwrap();
    drop(f1);
    let mut f2 = fs::File::create(&large).unwrap();
    f2.write_all(&[0u8; 100]).unwrap();
    f2.sync_all().unwrap();
    drop(f2);

    let found = find_job_archive(dir.to_str().unwrap()).unwrap();
    assert_eq!(found, large);

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn resolve_extract_destination_separate_folder() {
    let base = Path::new("D:\\Games");
    let dest = resolve_extract_destination("My Game!", base, "separate-folder");
    assert_eq!(dest, PathBuf::from("D:\\Games\\My Game_"));
  }

  #[test]
  fn resolve_extract_destination_single_folder() {
    let base = Path::new("D:\\Games");
    let dest = resolve_extract_destination("My Game", base, "single-folder");
    assert_eq!(dest, base);
  }
}
