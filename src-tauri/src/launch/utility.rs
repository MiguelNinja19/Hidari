use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

pub(crate) fn is_utility_subfolder(name: &str) -> bool {
    let lower = name.to_lowercase();
    matches!(
        lower.as_str(),
        "md5"
            | "_redist"
            | "redist"
            | "_commonredist"
            | "commonredist"
            | "directx"
            | "dx"
            | "dotnet"
            | "support"
            | "tools"
            | "extras"
            | "bonus"
            | "optional"
            | "__installer"
            | "engine"
            | "redistributables"
    ) || lower.contains("redist")
        || lower.contains("directx")
}
