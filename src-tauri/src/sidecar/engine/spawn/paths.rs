use crate::config::{self, ARIA2_BINARY};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn resolve_engine_path(app: &AppHandle) -> PathBuf {
  let exe_name = config::download_engine_binary_name();
  let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  let mut engine_candidates: Vec<PathBuf> = vec![
    manifest_dir.join("binaries").join(&exe_name),
    manifest_dir.join(&exe_name),
  ];
  if let Ok(resource_dir) = app.path().resource_dir() {
    engine_candidates.push(resource_dir.join("binaries").join(&exe_name));
    engine_candidates.push(resource_dir.join(&exe_name));
  }
  if let Ok(cwd) = std::env::current_dir() {
    engine_candidates.push(cwd.join(&exe_name));
    engine_candidates.push(cwd.join("src-tauri").join(&exe_name));
    engine_candidates.push(cwd.join("src-tauri").join("binaries").join(&exe_name));
    engine_candidates.push(
      cwd.join("..")
        .join("download-engine")
        .join("target")
        .join("release")
        .join(&exe_name),
    );
    engine_candidates.push(
      cwd.join("..")
        .join("download-engine")
        .join("target")
        .join("debug")
        .join(&exe_name),
    );
  }
  if let Ok(app_data_dir) = app.path().app_data_dir() {
    engine_candidates.push(app_data_dir.parent().unwrap_or(&app_data_dir).join(&exe_name));
  }
  engine_candidates
    .into_iter()
    .find(|path| path.exists())
    .unwrap_or_else(|| PathBuf::from(exe_name))
}

pub fn resolve_aria2_path(app: &AppHandle, engine_path: &PathBuf) -> Option<PathBuf> {
  let mut candidates: Vec<PathBuf> = Vec::new();
  let bundled_aria2 = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("binaries")
    .join(ARIA2_BINARY);
  candidates.push(bundled_aria2.clone());
  if let Some(parent) = engine_path.parent() {
    let sidecar_local_aria2 = parent.join(ARIA2_BINARY);
    if !sidecar_local_aria2.exists() && bundled_aria2.exists() {
      let _ = std::fs::copy(&bundled_aria2, &sidecar_local_aria2);
    }
    candidates.push(sidecar_local_aria2);
    candidates.push(parent.join(ARIA2_BINARY));
    candidates.push(parent.join("tools").join(ARIA2_BINARY));
  }
  if let Ok(cwd) = std::env::current_dir() {
    candidates.push(cwd.join("binaries").join(ARIA2_BINARY));
    candidates.push(cwd.join("src-tauri").join("binaries").join(ARIA2_BINARY));
    candidates.push(cwd.join("..").join("src-tauri").join("binaries").join(ARIA2_BINARY));
  }
  if let Ok(resource_dir) = app.path().resource_dir() {
    candidates.push(resource_dir.join(ARIA2_BINARY));
    candidates.push(resource_dir.join("tools").join(ARIA2_BINARY));
    candidates.push(resource_dir.join("binaries").join(ARIA2_BINARY));
  }
  candidates.into_iter().find(|path| path.exists())
}
