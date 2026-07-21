use std::path::{Component, Path, PathBuf};

pub fn reject_parent_components(path: &Path) -> Result<(), String> {
  if path
    .components()
    .any(|component| matches!(component, Component::ParentDir))
  {
    return Err("path_contains_parent_dir".to_string());
  }
  Ok(())
}

/// Path absoluto sem componentes `..`. Não exige que exista.
pub fn validate_absolute_user_path(raw: &str) -> Result<PathBuf, String> {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return Err("path_empty".to_string());
  }
  let path = PathBuf::from(trimmed);
  if !path.is_absolute() {
    return Err("path_must_be_absolute".to_string());
  }
  reject_parent_components(&path)?;
  Ok(path)
}

#[cfg(not(windows))]
fn normalize_for_compare(path: &Path) -> PathBuf {
  if let Ok(canonical) = std::fs::canonicalize(path) {
    return canonical;
  }
  let mut normalized = PathBuf::new();
  for component in path.components() {
    match component {
      Component::CurDir => {}
      Component::ParentDir => {
        let _ = normalized.pop();
      }
      other => normalized.push(other.as_os_str()),
    }
  }
  normalized
}

#[cfg(not(windows))]
fn paths_equal_ci(a: &Path, b: &Path) -> bool {
  a == b
}

pub fn is_path_under_root(candidate: &Path, root: &Path) -> bool {
  #[cfg(windows)]
  {
    let candidate_s = candidate
      .to_string_lossy()
      .trim()
      .trim_end_matches(['\\', '/'])
      .replace('/', "\\")
      .to_ascii_lowercase();
    let root_s = root
      .to_string_lossy()
      .trim()
      .trim_end_matches(['\\', '/'])
      .replace('/', "\\")
      .to_ascii_lowercase();
    if candidate_s.is_empty() || root_s.is_empty() {
      return false;
    }
    candidate_s == root_s || candidate_s.starts_with(&(root_s.clone() + "\\"))
  }
  #[cfg(not(windows))]
  {
    let candidate_n = normalize_for_compare(candidate);
    let root_n = normalize_for_compare(root);
    paths_equal_ci(&candidate_n, &root_n) || candidate_n.starts_with(&root_n)
  }
}
