use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

pub(crate) fn collect_mac_launch_candidates(
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
            if is_mac_app_bundle(&path) {
                out.push((depth, path));
                continue;
            }
            if is_utility_subfolder(name) || is_mac_utility_subfolder(name) {
                continue;
            }
            collect_mac_launch_candidates(&path, depth + 1, max_depth, out);
            continue;
        }

        if is_mach_o_executable(&path) {
            out.push((depth, path));
        }
    }
}

pub(crate) fn folder_has_playable_game_mac_depth(
    title: &str,
    folder: &Path,
    max_depth: usize,
) -> bool {
    if !folder.is_dir() {
        return false;
    }

    let title_tokens = title::tokenize_title(title);
    let mut local: Vec<(usize, PathBuf)> = Vec::new();
    collect_mac_launch_candidates(folder, 0, max_depth, &mut local);

    for (depth, path) in local {
        if !is_mac_launch_target(&path) {
            continue;
        }
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if !is_likely_game_mac_name(file_name) {
            continue;
        }
        if !path_matches_title_tokens(&path, &title_tokens) {
            continue;
        }
        if score_mac_launch_candidate(&path, depth, &title_tokens) > 0 {
            return true;
        }
    }

    false
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn folder_has_playable_game_mac(title: &str, folder: &Path) -> bool {
    folder_has_playable_game_mac_depth(title, folder, SCAN_DEPTH_FAST)
        || folder_has_playable_game_mac_depth(title, folder, SCAN_DEPTH_FULL)
}
