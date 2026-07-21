use super::super::*;
use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

#[cfg(target_os = "windows")]
pub(crate) fn spawn_via_cmd_start(
    target: &Path,
    work_dir: &Path,
    extra_args: &[String],
) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "cmd_start: invalid file name".to_string())?;

    // Usar nome relativo evita que o cmd interprete [ ] no caminho como wildcards.
    let mut cmd_line = vec![
        "/C".to_string(),
        "start".to_string(),
        "".to_string(),
        file_name.to_string(),
    ];
    cmd_line.extend(extra_args.iter().cloned());
    let cmd_refs: Vec<&str> = cmd_line.iter().map(String::as_str).collect();
    StdCommand::new("cmd")
        .current_dir(work_dir)
        .creation_flags(CREATE_NO_WINDOW)
        .args(cmd_refs)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("cmd_start: {error}"))
}

#[cfg(target_os = "windows")]
pub(crate) fn spawn_via_cmd_quoted_fullpath(
    target: &Path,
    work_dir: &Path,
    extra_args: &[String],
) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let full = target.to_string_lossy();
    let mut cmd_line = vec![
        "/C".to_string(),
        "start".to_string(),
        "".to_string(),
        format!("\"{full}\""),
    ];
    cmd_line.extend(extra_args.iter().cloned());
    let cmd_refs: Vec<&str> = cmd_line.iter().map(String::as_str).collect();
    StdCommand::new("cmd")
        .current_dir(work_dir)
        .creation_flags(CREATE_NO_WINDOW)
        .args(cmd_refs)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("cmd_quoted_fullpath: {error}"))
}
