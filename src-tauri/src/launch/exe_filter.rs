use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

pub fn is_likely_game_exe(file_name: &str) -> bool {
    let lower = file_name.to_lowercase();
    let stem = lower.strip_suffix(".exe").unwrap_or(&lower);

    let blocked_exact = [
        "setup",
        "unins",
        "uninstall",
        "installer",
        "dxsetup",
        "dotnet",
        "unitycrashhandler",
        "websetup",
        "readme",
        "notification",
        "benchmark",
        "activator",
        "license",
    ];
    if blocked_exact.contains(&stem) {
        return false;
    }

    if is_store_or_platform_launcher_exe(file_name, Path::new(file_name)) {
        return false;
    }

    let blocked_contains = [
        "unins",
        "uninstall",
        "crashreport",
        "vcredist",
        "vc_redist",
        "easyanticheat",
        "battleye",
        "eac_",
        "_eac",
        "prereq",
        "prerequisite",
        "quicksfv",
        "md5sum",
        "checksum",
        "redist",
        "physx",
        "bepinex",
        "modloader",
        "webhelper",
        "crashhandler",
        "error",
        "debug",
        "sample",
        "dedicatedserver",
        "dedicated_server",
    ];
    !blocked_contains.iter().any(|token| lower.contains(token))
}
pub(crate) fn stem_of_exe(file_name: &str) -> &str {
    file_name
        .strip_suffix(".exe")
        .or_else(|| file_name.strip_suffix(".EXE"))
        .unwrap_or(file_name)
}
pub(crate) fn is_blocked_installer_exe(file_name: &str) -> bool {
    let lower = file_name.to_lowercase();
    let stem = lower.strip_suffix(".exe").unwrap_or(&lower);
    matches!(
        stem,
        "setup"
            | "unins"
            | "uninstall"
            | "installer"
            | "dxsetup"
            | "dotnet"
            | "vcredist"
            | "vc_redist"
            | "websetup"
            | "unitycrashhandler"
    ) || lower.contains("vcredist")
        || lower.contains("dxsetup")
        || lower.contains("quicksfv")
        || lower.contains("md5sum")
        || lower.contains("checksum")
        || is_store_or_platform_launcher_exe(file_name, Path::new(file_name))
}
