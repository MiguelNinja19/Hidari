use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

pub(crate) fn is_store_or_platform_launcher_exe(file_name: &str, path: &Path) -> bool {
    let lower = file_name.to_lowercase();
    let stem = lower.strip_suffix(".exe").unwrap_or(&lower);

    const BLOCKED_STEMS: &[&str] = &[
        "steam",
        "steamservice",
        "steamerror",
        "steambootstrapper",
        "steamwebhelper",
        "gameoverlayui",
        "epicgameslauncher",
        "origin",
        "originwebhelper",
        "upc",
        "uplay",
        "uplaylauncher",
        "goggalaxy",
        "galaxyclient",
        "galaxycommunication",
        "bethesdanetlauncher",
        "eadesktop",
        "eacomponent",
        "rockstargameslauncher",
        "rgl",
        "battlenet",
        "agent",
        "ubisoftgamelauncher",
        "xboxapp",
        "launcher",
        "gamelauncher",
        "game_launcher",
        "playnite",
        "playnitedesktop",
    ];
    if BLOCKED_STEMS.contains(&stem) {
        return true;
    }

    let path_lower = path.to_string_lossy().to_lowercase();
    if path_lower.contains("\\steam\\") && !path_lower.contains("\\steamapps\\common\\") {
        return true;
    }

    false
}
