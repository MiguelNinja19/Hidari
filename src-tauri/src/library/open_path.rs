use std::path::Path;
use std::process::Command;

pub fn open_path_in_shell(target: &Path) -> Result<(), String> {
    if !target.exists() {
        return Err("local_path_not_found".to_string());
    }

    #[cfg(target_os = "windows")]
    Command::new("explorer")
        .arg(target.as_os_str())
        .spawn()
        .map_err(|error| format!("could_not_open_folder: {error}"))?;

    #[cfg(target_os = "linux")]
    Command::new("xdg-open")
        .arg(target.as_os_str())
        .spawn()
        .map_err(|error| format!("could_not_open_folder: {error}"))?;

    #[cfg(target_os = "macos")]
    Command::new("open")
        .arg(target.as_os_str())
        .spawn()
        .map_err(|error| format!("could_not_open_folder: {error}"))?;

    Ok(())
}
