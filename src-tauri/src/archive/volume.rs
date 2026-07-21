use std::path::PathBuf;

pub(crate) fn prefer_archive_volume(paths: Vec<PathBuf>) -> Option<PathBuf> {
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
