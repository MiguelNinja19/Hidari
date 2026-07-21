use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub(crate) fn covers_dir_for_app(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app.path().app_data_dir()
    .map_err(|error| format!("could_not_resolve_app_data_dir: {error}"))?
    .join("covers");
  std::fs::create_dir_all(&dir)
    .map_err(|error| format!("could_not_create_covers_dir: {error}"))?;
  Ok(dir)
}

pub fn is_valid_cover_bytes(bytes: &[u8]) -> bool {
  bytes.len() >= 256 && (
    bytes.starts_with(&[0xFF, 0xD8, 0xFF])
      || bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
      || (bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"))
      || bytes.starts_with(b"GIF87a")
      || bytes.starts_with(b"GIF89a")
  )
}

pub fn is_plausible_cover_url(url: &str) -> bool {
  let url = url.trim();
  url.len() >= 12 && (url.starts_with("http://") || url.starts_with("https://"))
}

pub fn is_plausible_local_cover_path(path: &str, covers_dir: &Path) -> bool {
  let path = path.trim();
  if path.is_empty() || path.contains("://") || Path::new(path).is_relative() {
    return false;
  }
  if [".jpg:", ".jpeg:", ".png:", ".webp:"].iter().any(|part| path.contains(part)) {
    return false;
  }
  if path.starts_with("\\\\") {
    let leaf = covers_dir.file_name().and_then(|name| name.to_str()).unwrap_or("covers");
    return path.to_ascii_lowercase().contains(&format!("\\{}\\", leaf.to_ascii_lowercase()));
  }
  true
}

pub fn is_usable_cover_file(path: &Path, covers_dir: &Path) -> bool {
  if !is_plausible_local_cover_path(&path.to_string_lossy(), covers_dir) || !path.is_file() {
    return false;
  }
  let (Ok(file), Ok(dir), Ok(bytes)) = (
    path.canonicalize(),
    covers_dir.canonicalize(),
    std::fs::read(path),
  ) else {
    return false;
  };
  file.starts_with(dir) && is_valid_cover_bytes(&bytes)
}

pub fn remove_cover_file(path: &str) {
  let _ = std::fs::remove_file(path);
}
