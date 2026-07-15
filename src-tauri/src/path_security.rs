//! Validação de caminhos vindos do frontend (IPC).
//! Rejeita `..`, caminhos relativos e destinos fora da pasta de downloads / roots conhecidos.

use crate::db::{get_default_download_path, open_database_connection};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

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

fn listed_library_game_roots(app: &AppHandle) -> Vec<PathBuf> {
  let Ok(conn) = open_database_connection(app) else {
    return Vec::new();
  };
  let Ok(mut stmt) = conn.prepare("SELECT game_root FROM library_game_roots") else {
    return Vec::new();
  };
  stmt
    .query_map([], |row| row.get::<_, String>(0))
    .ok()
    .into_iter()
    .flatten()
    .filter_map(|result| result.ok())
    .map(PathBuf::from)
    .filter(|path| path.is_absolute())
    .collect()
}

fn app_managed_roots(app: &AppHandle) -> Vec<PathBuf> {
  let mut roots = Vec::new();
  if let Ok(Some(download)) = get_default_download_path(app) {
    let path = PathBuf::from(download.trim());
    if path.is_absolute() {
      roots.push(path);
    }
  }
  roots.extend(listed_library_game_roots(app));
  if let Ok(data) = app.path().app_data_dir() {
    roots.push(data);
  }
  if let Ok(cache) = app.path().app_cache_dir() {
    roots.push(cache);
  }
  if let Ok(config) = app.path().app_config_dir() {
    roots.push(config);
  }
  roots
}

/// Pasta de download default: absoluto, sem `..` (pode ainda não existir).
pub fn validate_download_root_setting(raw: &str) -> Result<String, String> {
  let path = validate_absolute_user_path(raw)?;
  Ok(path.to_string_lossy().to_string())
}

/// Destino de enqueue: tem de estar sob (ou ser) a pasta de downloads configurada.
pub fn validate_enqueue_dest_path(app: &AppHandle, dest_path: &str) -> Result<String, String> {
  let candidate = validate_absolute_user_path(dest_path)?;
  let download = get_default_download_path(app)?
    .filter(|value| !value.trim().is_empty())
    .ok_or_else(|| "default_download_path_not_configured".to_string())?;
  let root = validate_absolute_user_path(&download)?;
  if !is_path_under_root(&candidate, &root) {
    return Err("path_outside_default_download_path".to_string());
  }
  Ok(candidate.to_string_lossy().to_string())
}

/// Paths usados para launch / open / delete: pasta de downloads, game roots ou dirs da app.
pub fn validate_managed_path(app: &AppHandle, raw: &str) -> Result<PathBuf, String> {
  let candidate = validate_absolute_user_path(raw)?;
  let roots = app_managed_roots(app);
  if roots.is_empty() {
    return Err("no_allowed_path_roots".to_string());
  }
  if roots.iter().any(|root| is_path_under_root(&candidate, root)) {
    return Ok(candidate);
  }
  Err("path_outside_allowed_roots".to_string())
}

/// `game_root` escolhido pelo utilizador: absoluto, sem `..`, e tem de existir como pasta.
pub fn validate_existing_directory(raw: &str) -> Result<PathBuf, String> {
  let path = validate_absolute_user_path(raw)?;
  if !path.is_dir() {
    return Err("path_not_a_directory".to_string());
  }
  Ok(path)
}

/// Migra AppData legado `com.mylauncher.app` → identifier atual (`com.hidari.app`).
pub fn migrate_legacy_app_data(app: &AppHandle) -> Result<(), String> {
  let new_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("could_not_get_app_data_dir: {e}"))?;
  let Some(parent) = new_dir.parent() else {
    return Ok(());
  };
  let legacy_dir = parent.join("com.mylauncher.app");
  if !legacy_dir.is_dir() || legacy_dir == new_dir {
    return Ok(());
  }

  let new_db = new_dir.join("launcher.db");
  let legacy_db = legacy_dir.join("launcher.db");
  if new_db.exists() || !legacy_db.is_file() {
    return Ok(());
  }

  std::fs::create_dir_all(&new_dir).map_err(|e| format!("could_not_create_app_data_dir: {e}"))?;
  std::fs::copy(&legacy_db, &new_db)
    .map_err(|e| format!("could_not_migrate_legacy_db: {e}"))?;

  for sidecar in ["launcher.db-wal", "launcher.db-shm"] {
    let from = legacy_dir.join(sidecar);
    if from.is_file() {
      let _ = std::fs::copy(&from, new_dir.join(sidecar));
    }
  }

  let legacy_covers = legacy_dir.join("covers");
  let new_covers = new_dir.join("covers");
  if legacy_covers.is_dir() && !new_covers.exists() {
    let _ = copy_dir_recursive(&legacy_covers, &new_covers);
  }

  eprintln!(
    "migrated_legacy_app_data: {} -> {}",
    legacy_dir.display(),
    new_dir.display()
  );
  Ok(())
}

fn copy_dir_recursive(from: &Path, to: &Path) -> Result<(), String> {
  std::fs::create_dir_all(to).map_err(|e| format!("could_not_create_dir: {e}"))?;
  for entry in std::fs::read_dir(from).map_err(|e| format!("could_not_read_dir: {e}"))? {
    let entry = entry.map_err(|e| format!("could_not_read_entry: {e}"))?;
    let src = entry.path();
    let dest = to.join(entry.file_name());
    if src.is_dir() {
      copy_dir_recursive(&src, &dest)?;
    } else {
      std::fs::copy(&src, &dest).map_err(|e| format!("could_not_copy_file: {e}"))?;
    }
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rejects_parent_components() {
    assert!(reject_parent_components(Path::new(r"C:\Games\..\Windows")).is_err());
    assert!(reject_parent_components(Path::new(r"C:\Games\Hidari")).is_ok());
  }

  #[test]
  fn requires_absolute() {
    assert!(validate_absolute_user_path("relative\\folder").is_err());
    #[cfg(windows)]
    assert!(validate_absolute_user_path(r"D:\Games").is_ok());
    #[cfg(not(windows))]
    assert!(validate_absolute_user_path("/tmp/games").is_ok());
  }

  #[test]
  fn under_root_checks() {
    #[cfg(windows)]
    {
      let root = Path::new(r"D:\Games");
      assert!(is_path_under_root(Path::new(r"D:\Games\Foo"), root));
      assert!(is_path_under_root(Path::new(r"D:\Games"), root));
      assert!(!is_path_under_root(Path::new(r"C:\Windows"), root));
    }
    #[cfg(not(windows))]
    {
      let root = Path::new("/data/games");
      assert!(is_path_under_root(Path::new("/data/games/foo"), root));
      assert!(!is_path_under_root(Path::new("/etc"), root));
    }
  }
}
