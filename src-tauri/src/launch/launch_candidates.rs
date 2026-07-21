use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

pub fn launch_game_candidates(candidates: &[PathBuf]) -> Result<PathBuf, String> {
    let mut last_error = String::from("nenhum executável válido encontrado");

    #[cfg(target_os = "macos")]
    {
        for path in candidates.iter().take(MAX_LAUNCH_CANDIDATES) {
            if !is_mac_launch_target(path) {
                continue;
            }
            match spawn_game_executable(path) {
                Ok(()) => return Ok(path.clone()),
                Err(error) => last_error = error,
            }
        }

        if candidates
            .iter()
            .any(|path| path.is_file() && is_probably_executable(path))
        {
            return Err("mac_windows_repack_only".to_string());
        }

        return Err(last_error);
    }

    #[cfg(not(target_os = "macos"))]
    for path in candidates.iter().take(MAX_LAUNCH_CANDIDATES) {
        if !is_valid_pe_executable(path) {
            continue;
        }
        match spawn_game_executable(path) {
            Ok(()) => return Ok(path.clone()),
            Err(error) => last_error = error,
        }
    }

    Err(last_error)
}

pub(crate) fn try_launch_executable(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if is_mac_app_bundle(path) {
            return spawn_game_executable(path);
        }
        if path.is_file() && is_mach_o_executable(path) {
            return spawn_game_executable(path);
        }
        if path.is_file() && is_probably_executable(path) {
            return Err("mac_windows_repack_only".to_string());
        }
        return Err("not_executable".to_string());
    }

    #[cfg(not(target_os = "macos"))]
    {
        if !path.is_file() || !is_probably_executable(path) {
            return Err("not_executable".to_string());
        }
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if is_blocked_installer_exe(file_name) || is_store_or_platform_launcher_exe(file_name, path)
        {
            return Err("blocked_executable".to_string());
        }
        spawn_game_executable(path)
    }
}
