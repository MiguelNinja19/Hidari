use std::path::Path;

use crate::archive;
use crate::config;
use crate::launch;

fn coded(code: &str, detail: &str) -> String {
  format!("launch_error:{code}|{detail}")
}

pub fn map_launch_user_error(error: &str, dest_path: &str) -> String {
  if error.contains("launch_target_root_not_found") {
    return coded("path_not_found", error);
  }
  if error.contains("game_not_installed_use_installer") {
    return coded("needs_install", error);
  }
  if error.contains("no_executable_found_in_job_folder") {
    if archive::find_job_archive(dest_path).is_some() {
      return coded("repack_needs_setup", error);
    }
    if launch::find_setup_executable("", dest_path).is_some() {
      return coded("needs_install", error);
    }
    return coded("no_executable", error);
  }
  if error.contains("193")
    || error.contains("não é um aplicativo Win32 válido")
    || error.contains("not a valid Win32 application")
  {
    return coded("win32_blocked", error);
  }
  if error.contains("1392")
    || error.contains("corrompido")
    || error.contains("corrupt")
    || error.contains("ilegível")
    || error.contains("illegible")
  {
    let chkdsk = config::windows_drive_letter(dest_path)
      .map(|drive| format!(" Se persistir, execute: chkdsk {drive}: /F"))
      .unwrap_or_default();
    return coded(
      "file_corrupt",
      &format!("{error}{chkdsk}"),
    );
  }
  if error.contains("nenhum executável válido encontrado") {
    return coded("no_valid_executable", error);
  }
  if error.contains("7z_not_found") {
    return coded("seven_zip_missing", error);
  }
  if error.contains("no_archive_found") {
    return coded("archive_not_found", error);
  }
  error.to_string()
}

#[allow(dead_code)]
pub fn path_parent_drive(path: &Path) -> Option<char> {
  path.to_str().and_then(config::windows_drive_letter)
}
