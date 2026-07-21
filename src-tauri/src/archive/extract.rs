use std::path::{Path, PathBuf};

pub(crate) fn sanitize_folder_name(title: &str) -> String {
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

/// Pasta de destino por jogo: `download_root/Title` (evita tudo em J:\dddd).
pub fn resolve_enqueue_dest_folder(download_root: &str, title: &str) -> PathBuf {
  let root = PathBuf::from(download_root.trim());
  root.join(sanitize_folder_name(title))
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
