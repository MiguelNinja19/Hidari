use super::super::*;
use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

#[cfg(target_os = "windows")]
pub(crate) fn spawn_via_create_process(
    target: &Path,
    work_dir: &Path,
    extra_args: &[String],
) -> Result<(), String> {
    let mut command = StdCommand::new(target);
    command.current_dir(work_dir);
    for arg in extra_args {
        command.arg(arg);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("create_process: {error}"))
}
#[cfg(target_os = "windows")]
pub(crate) fn spawn_via_powershell_process(
    target: &Path,
    work_dir: &Path,
    extra_args: &[String],
) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let target_escaped = escape_powershell_single_quoted(&target.to_string_lossy());
    let work_escaped = escape_powershell_single_quoted(&work_dir.to_string_lossy());
    let args_joined = extra_args.join(" ");
    let script = if args_joined.is_empty() {
        format!(
      "$p=New-Object System.Diagnostics.ProcessStartInfo; $p.FileName='{target_escaped}'; $p.WorkingDirectory='{work_escaped}'; $p.UseShellExecute=$true; [void][Diagnostics.Process]::Start($p)"
    )
    } else {
        let args_escaped = escape_powershell_single_quoted(&args_joined);
        format!(
      "$p=New-Object System.Diagnostics.ProcessStartInfo; $p.FileName='{target_escaped}'; $p.WorkingDirectory='{work_escaped}'; $p.Arguments='{args_escaped}'; $p.UseShellExecute=$true; [void][Diagnostics.Process]::Start($p)"
    )
    };

    let mut child = StdCommand::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .spawn()
        .map_err(|error| format!("powershell_process: {error}"))?;

    let status = child
        .wait()
        .map_err(|error| format!("powershell_process: {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "powershell_process: exit code {}",
            status.code().unwrap_or(-1)
        ))
    }
}
#[cfg(target_os = "windows")]
pub(crate) fn escape_powershell_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}
