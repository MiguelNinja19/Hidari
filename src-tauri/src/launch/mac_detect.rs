use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

/// True when `path` is a macOS `.app` bundle with `Contents/MacOS/`.
pub fn is_mac_app_bundle(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();
    if !name.ends_with(".app") {
        return false;
    }
    path.join("Contents/MacOS").is_dir()
}

/// Reads Mach-O or universal (fat) binary magic from the file header.
pub fn is_mach_o_executable(path: &Path) -> bool {
    let mut file = match fs::File::open(path) {
        Ok(value) => value,
        Err(_) => return false,
    };
    let mut magic = [0u8; 4];
    if file.read_exact(&mut magic).is_err() {
        return false;
    }
    matches!(
        u32::from_be_bytes(magic),
        0xFEED_FACE | 0xFEED_FACF | 0xCEFA_EDFE | 0xCFFA_EDFE | 0xCAFE_BABE | 0xBEBA_FECA
    )
}

pub(crate) fn is_mac_utility_subfolder(name: &str) -> bool {
    let lower = name.to_lowercase();
    matches!(
        lower.as_str(),
        "frameworks"
            | "plugins"
            | "plug-ins"
            | "_codesignature"
            | ".dsym"
            | "__macosx"
            | "contents"
            | "resources"
            | "sharedsupport"
            | "helpers"
    )
}

pub(crate) fn is_mac_launch_target(path: &Path) -> bool {
    is_mac_app_bundle(path) || (path.is_file() && is_mach_o_executable(path))
}

pub(crate) fn is_likely_game_mac_name(file_name: &str) -> bool {
    let lower = file_name.to_lowercase();
    let stem = lower.strip_suffix(".app").unwrap_or(&lower);

    let blocked_exact = [
        "setup",
        "uninstall",
        "unins",
        "installer",
        "updater",
        "crashpad_handler",
        "crashhandler",
        "unitycrashhandler",
        "notification",
        "benchmark",
        "activator",
        "license",
        "steam",
        "launcher",
        "gamelauncher",
    ];
    if blocked_exact.contains(&stem) {
        return false;
    }

    let blocked_contains = [
        "unins",
        "uninstall",
        "crashreport",
        "crashhandler",
        "webhelper",
        "updater",
        "redist",
        "prerequisite",
        "prereq",
    ];
    !blocked_contains.iter().any(|token| lower.contains(token))
}
