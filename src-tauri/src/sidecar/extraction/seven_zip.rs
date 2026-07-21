use crate::config::SEVEN_ZIP_BINARY;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};

pub fn resolve_7z_path(app: &AppHandle) -> Result<PathBuf, String> {
  let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  let mut candidates = vec![
    manifest.join("binaries/7za.exe"),
    manifest.join("binaries").join(SEVEN_ZIP_BINARY),
    PathBuf::from(r"C:\Program Files\7-Zip\7z.exe"),
    PathBuf::from(r"C:\Program Files (x86)\7-Zip\7z.exe"),
  ];
  if let Ok(dir) = app.path().resource_dir() {
    for name in ["binaries/7za.exe", "binaries/7z.exe", "7za.exe", "7z.exe"] {
      candidates.push(dir.join(name));
    }
  }
  if let Ok(dir) = std::env::current_dir() {
    for name in [
      "binaries/7za.exe", "binaries/7z.exe",
      "src-tauri/binaries/7za.exe", "src-tauri/binaries/7z.exe",
    ] {
      candidates.push(dir.join(name));
    }
  }
  if let Some(path) = candidates.into_iter().find(|path| path.exists()) {
    return Ok(path);
  }
  which_7z_on_path()
    .map(|_| PathBuf::from("7z"))
    .ok_or_else(|| "7z_not_found: execute npm run setup:binaries".to_string())
}

#[cfg(target_os = "windows")]
pub fn which_7z_on_path() -> Option<PathBuf> {
  Command::new("where")
    .arg("7z")
    .output()
    .ok()
    .filter(|output| output.status.success())
    .and_then(|output| String::from_utf8(output.stdout).ok())
    .and_then(|text| text.lines().next().map(|line| PathBuf::from(line.trim())))
}

#[cfg(not(target_os = "windows"))]
pub fn which_7z_on_path() -> Option<PathBuf> {
  Command::new("which")
    .arg("7z")
    .output()
    .ok()
    .filter(|output| output.status.success())
    .and_then(|output| String::from_utf8(output.stdout).ok())
    .map(|text| PathBuf::from(text.trim()))
}

pub fn run_7z_extract(seven_zip: &Path, archive: &Path, dest: &Path) -> Result<(), String> {
  std::fs::create_dir_all(dest)
    .map_err(|error| format!("could_not_create_extract_dir: {error}"))?;
  let mut command = Command::new(seven_zip);
  if let Some(parent) = seven_zip.parent().filter(|path| !path.as_os_str().is_empty()) {
    command.current_dir(parent);
  }
  let output = command
    .arg("x")
    .arg("-y")
    .arg(format!("-o{}", dest.display()))
    .arg(archive)
    .output()
    .map_err(|error| format!("could_not_run_7z: {error}"))?;
  if output.status.success() {
    Ok(())
  } else {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    if is_password_required_output(&stderr, &stdout) {
      return Err(format!(
        "archive_password_required: stderr={stderr} stdout={stdout}"
      ));
    }
    Err(format!(
      "7z_extract_failed: status={} stderr={stderr} stdout={stdout}",
      output.status
    ))
  }
}

fn is_password_required_output(stderr: &str, stdout: &str) -> bool {
  let combined = format!("{stderr}\n{stdout}").to_ascii_lowercase();
  if combined.contains("wrong password")
    || combined.contains("enter password")
    || combined.contains("password required")
    || combined.contains("cannot open encrypted")
    || combined.contains("data error in encrypted")
    || combined.contains("encrypted file is corrupt")
    || combined.contains("headers error in encrypted")
    || (combined.contains("encrypted") && combined.contains("password"))
  {
    return true;
  }
  // Online-Fix / RAR com senha: 7za costuma só dizer "Cannot open the file as archive".
  let looks_like_archive = combined.contains(".rar")
    || combined.contains(".zip")
    || combined.contains(".7z")
    || combined.contains("extracting archive:");
  looks_like_archive
    && (combined.contains("cannot open the file as archive")
      || combined.contains("can't open as archive"))
}
