use std::path::{Path, PathBuf};

const ARCHIVE_EXTENSIONS: &[&str] = &["zip", "7z", "rar", "001", "tar", "gz", "bz2", "xz"];
const DOWNLOAD_SCAN_MAX_DEPTH: u32 = 4;

/// Returns true if the path has a known archive extension.
pub fn is_archive_extension(path: &Path) -> bool {
  let ext = path
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.to_lowercase())
    .unwrap_or_default();
  ARCHIVE_EXTENSIONS.contains(&ext.as_str())
}

fn is_payload_extension(path: &Path) -> bool {
  path
    .extension()
    .and_then(|e| e.to_str())
    .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "exe" | "msi" | "iso" | "bin"))
    .unwrap_or(false)
}

fn resolve_job_folder(dest_path: &str) -> PathBuf {
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

fn walk_download_candidates(
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
  fn find_job_archive_finds_nested_torrent_subfolder() {
    let dir = std::env::temp_dir().join(format!("launcher_nested_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    let sub = dir.join("Terraria v1.4.4.1");
    fs::create_dir_all(&sub).unwrap();

    let archive = sub.join("Terraria.7z");
    let mut f = fs::File::create(&archive).unwrap();
    f.write_all(&[0u8; 128]).unwrap();
    f.sync_all().unwrap();
    drop(f);

    let found = find_job_archive(dir.to_str().unwrap()).unwrap();
    assert_eq!(found, archive);

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn find_download_payload_finds_setup_in_subfolder() {
    let dir = std::env::temp_dir().join(format!("launcher_setup_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    let sub = dir.join("Game Repack");
    fs::create_dir_all(&sub).unwrap();

    let setup = sub.join("setup.exe");
    let mut f = fs::File::create(&setup).unwrap();
    f.write_all(&[0u8; 64]).unwrap();
    f.sync_all().unwrap();
    drop(f);

    let found = find_download_payload(dir.to_str().unwrap()).unwrap();
    assert_eq!(found, setup);

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
