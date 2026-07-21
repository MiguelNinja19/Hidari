use super::paths::{catalog_cache_dir, catalog_cache_path_for_remote_url};
use super::paths_local::resolve_local_catalog_path_for_write;
use super::paths_resolve::resolve_api_cache_json_path;
use std::collections::HashSet;
use std::path::PathBuf;
use tauri::AppHandle;

pub fn delete_source_catalog_json_file(app: &AppHandle, source: &crate::dto::HydraSourceDto) {
  let Ok(cache_dir) = catalog_cache_dir(app) else {
    return;
  };
  let Ok(cache_dir) = cache_dir.canonicalize() else {
    return;
  };

  let mut candidates: Vec<PathBuf> = Vec::new();
  if let Ok(path) = resolve_local_catalog_path_for_write(&source.url) {
    candidates.push(path);
  }
  if let Some(remote) = source
    .remote_url
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
  {
    if let Ok(path) = catalog_cache_path_for_remote_url(app, remote) {
      candidates.push(path);
    }
  }
  if let Ok(path) = resolve_api_cache_json_path(app, &source.id, &source.url) {
    candidates.push(path);
  }

  let mut seen = HashSet::new();
  for path in candidates {
    let Ok(canonical) = path.canonicalize() else {
      continue;
    };
    if !seen.insert(canonical.clone()) {
      continue;
    }
    if !canonical.starts_with(&cache_dir) {
      continue;
    }
    if canonical
      .extension()
      .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
    {
      match std::fs::remove_file(&canonical) {
        Ok(()) => eprintln!("catalog_json_deleted: {}", canonical.display()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
          eprintln!(
            "catalog_json_delete_failed: {} — {error}",
            canonical.display()
          );
        }
      }
    }
  }
}
