use super::super::*;
use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

pub(crate) fn spawn_executable_with_fallbacks(
    launch_target: &Path,
    prefer_shell: bool,
    extra_args: &[String],
) -> Result<(), String> {
    type SpawnExecutableFn = fn(&Path, &Path, &[String]) -> Result<(), String>;

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

    #[cfg(target_os = "windows")]
    {
        let mut errors: Vec<String> = Vec::new();
        let literal = path_needs_literal_launch(launch_target);
        // Jogos: CreateProcess + cmd/start apenas.
        // PowerShell frio + wait pode atrasar ~10–30s; explorer abre a pasta (não é lançar).
        let attempts: &[SpawnExecutableFn] = if !extra_args.is_empty() {
            &[spawn_via_create_process, spawn_via_powershell_process]
        } else if literal {
            &[spawn_via_create_process, spawn_via_cmd_quoted_fullpath]
        } else if prefer_shell {
            &[
                spawn_via_cmd_start,
                spawn_via_create_process,
                spawn_via_cmd_quoted_fullpath,
            ]
        } else {
            &[
                spawn_via_create_process,
                spawn_via_cmd_start,
                spawn_via_cmd_quoted_fullpath,
            ]
        };

        for attempt in attempts {
            match attempt(launch_target, &work_dir, extra_args) {
                Ok(()) => return Ok(()),
                Err(error) => errors.push(error),
            }
        }

        Err(errors.join(" | "))
    }

    #[cfg(not(target_os = "windows"))]
    {
        StdCommand::new(launch_target)
            .current_dir(&work_dir)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}
