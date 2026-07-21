use std::path::Path;

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

pub(crate) fn is_payload_extension(path: &Path) -> bool {
  path
    .extension()
    .and_then(|e| e.to_str())
    .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "exe" | "msi" | "iso" | "bin"))
    .unwrap_or(false)
}
