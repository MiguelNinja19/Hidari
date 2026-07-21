use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

#[cfg(target_os = "macos")]
pub(crate) fn enclosing_mac_app_bundle(path: &Path) -> Option<PathBuf> {
    let mut current = path.parent()?;
    loop {
        if is_mac_app_bundle(current) {
            return Some(current.to_path_buf());
        }
        current = current.parent()?;
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn spawn_mac_launch_target(launch_target: &Path) -> Result<(), String> {
    if is_mac_app_bundle(launch_target) {
        return StdCommand::new("open")
            .arg("-a")
            .arg(launch_target)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string());
    }

    if launch_target.is_file() {
        if let Some(app) = enclosing_mac_app_bundle(launch_target) {
            return StdCommand::new("open")
                .arg("-a")
                .arg(app)
                .spawn()
                .map(|_| ())
                .map_err(|error| error.to_string());
        }

        let work_dir = launch_target
            .parent()
            .filter(|path| path.exists())
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));

        return StdCommand::new(launch_target)
            .current_dir(&work_dir)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string());
    }

    Err(format!(
        "launch_target_not_found: {}",
        launch_target.to_string_lossy()
    ))
}
