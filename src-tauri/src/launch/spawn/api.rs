use super::super::*;
use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

pub(crate) fn path_needs_literal_launch(target: &Path) -> bool {
    let value = target.to_string_lossy();
    value.contains(['[', ']', '&', '^', '%', '!'])
}

pub fn spawn_game_executable(launch_target: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return spawn_mac_launch_target(launch_target);
    }
    spawn_executable_with_fallbacks(launch_target, false, &[])
}

#[allow(dead_code)]
pub fn spawn_setup_executable(launch_target: &Path) -> Result<(), String> {
    let install_dir = launch_target
        .parent()
        .filter(|path| path.exists())
        .map(Path::to_path_buf);
    spawn_setup_executable_in(launch_target, install_dir.as_deref())
}

pub fn spawn_setup_executable_in(
    launch_target: &Path,
    install_dir: Option<&Path>,
) -> Result<(), String> {
    if !launch_target.is_file() {
        return Err(format!(
            "launch_target_not_found: {}",
            launch_target.to_string_lossy()
        ));
    }

    let work_dir = launch_target
        .parent()
        .filter(|path| path.exists())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    let extra_args: Vec<String> = install_dir.map(inno_setup_args).unwrap_or_default();

    #[cfg(target_os = "windows")]
    {
        // Nunca cmd/start com /DIR= — paths com espaços ou & partem o comando do Windows.
        if spawn_via_create_process(launch_target, &work_dir, &extra_args).is_ok() {
            return Ok(());
        }
        spawn_via_powershell_process(launch_target, &work_dir, &extra_args)
    }

    #[cfg(not(target_os = "windows"))]
    {
        spawn_executable_with_fallbacks(launch_target, true, &extra_args)
    }
}

pub(crate) fn inno_setup_args(install_dir: &Path) -> Vec<String> {
    vec![
        format!("/DIR={}", install_dir.display()),
        "/SP-".to_string(),
    ]
}
