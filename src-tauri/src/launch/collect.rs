use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

pub(crate) fn collect_executable_candidates(
    root: &Path,
    depth: usize,
    max_depth: usize,
    out: &mut Vec<(usize, PathBuf)>,
) {
    if depth > max_depth {
        return;
    }

    let entries = match fs::read_dir(root) {
        Ok(values) => values,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let metadata = match entry.metadata() {
            Ok(value) => value,
            Err(_) => continue,
        };

        if metadata.is_dir() {
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            if is_utility_subfolder(name) {
                continue;
            }
            collect_executable_candidates(&path, depth + 1, max_depth, out);
            continue;
        }

        let is_exe = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("exe"))
            .unwrap_or(false);

        if is_exe {
            out.push((depth, path));
        }
    }
}
