use std::path::Path;
use tauri::{AppHandle, Manager};

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
