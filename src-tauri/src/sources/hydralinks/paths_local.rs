use std::path::PathBuf;

pub(crate) fn resolve_local_catalog_path(value: &str) -> Option<PathBuf> {
  let trimmed = value.trim();
  let path = if let Some(stripped) = trimmed.strip_prefix("file://") {
    let without_scheme = stripped.trim_start_matches('/');
    if without_scheme.len() >= 2 && without_scheme.as_bytes()[1] == b':' {
      PathBuf::from(without_scheme)
    } else {
      PathBuf::from(stripped)
    }
  } else {
    PathBuf::from(trimmed)
  };
  if path.is_file() {
    Some(path)
  } else {
    None
  }
}
pub(crate) fn resolve_local_catalog_path_for_write(value: &str) -> Result<PathBuf, String> {
  let trimmed = value.trim();
  let path = if let Some(stripped) = trimmed.strip_prefix("file://") {
    let without_scheme = stripped.trim_start_matches('/');
    if without_scheme.len() >= 2 && without_scheme.as_bytes()[1] == b':' {
      PathBuf::from(without_scheme)
    } else {
      PathBuf::from(stripped)
    }
  } else {
    PathBuf::from(trimmed)
  };
  if path
    .extension()
    .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
  {
    Ok(path)
  } else {
    Err("Caminho do arquivo .json inválido.".to_string())
  }
}
