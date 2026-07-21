use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

#[allow(dead_code)]
pub fn resolve_and_launch_game(title: &str, dest_path: &str) -> Result<PathBuf, String> {
    resolve_and_launch_game_with_extra_roots(title, dest_path, &[], None)
}

pub fn resolve_and_launch_game_with_extra_roots(
    title: &str,
    dest_path: &str,
    extra_roots: &[PathBuf],
    preferred_exe: Option<&Path>,
) -> Result<PathBuf, String> {
    // Exe em cache: se já está a correr, não abrir outra instância.
    if let Some(preferred) = preferred_exe {
        if preferred.is_file() && is_executable_running(preferred) {
            return Ok(preferred.to_path_buf());
        }
        // Lançar já — sem varrer a pasta do jogo (isso demora em installs grandes).
        if try_launch_executable(preferred).is_ok() {
            return Ok(preferred.to_path_buf());
        }
    }

    let fast = resolve_launch_candidates_with_extra_roots_depth(
        title,
        dest_path,
        extra_roots,
        SCAN_DEPTH_FAST,
    );
    if let Ok(ref candidates) = fast {
        if let Ok(path) = launch_game_candidates(candidates) {
            return Ok(path);
        }
    }

    // Scan profundo só se o rápido não encontrar nada.
    if fast.is_err() {
        if let Ok(candidates) =
            resolve_launch_candidates_with_extra_roots(title, dest_path, extra_roots)
        {
            if let Ok(path) = launch_game_candidates(&candidates) {
                return Ok(path);
            }
        }
    }

    if find_setup_executable_with_extra_roots(title, dest_path, extra_roots).is_some() {
        #[cfg(target_os = "macos")]
        return Err("mac_windows_repack_only".to_string());
        #[cfg(not(target_os = "macos"))]
        return Err("game_not_installed_use_installer".to_string());
    }

    Err("no_executable_found_in_job_folder".to_string())
}

pub fn job_has_game_executable(title: &str, dest_path: &str) -> bool {
    resolve_launch_candidates(title, dest_path).is_ok()
}

pub fn job_has_playable_executable(title: &str, dest_path: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        return job_has_game_executable(title, dest_path);
    }
    #[cfg(not(target_os = "macos"))]
    {
        job_has_game_executable(title, dest_path)
            || find_setup_executable(title, dest_path).is_some()
    }
}
