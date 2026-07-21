use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

pub(crate) fn score_mac_launch_candidate(
    path: &Path,
    depth: usize,
    title_tokens: &[String],
) -> i64 {
    let label = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();

    let mut score = 0i64;
    score -= (depth as i64) * 40;

    if is_mac_app_bundle(path) {
        score += 500;
        let stem = label.strip_suffix(".app").unwrap_or(&label);
        for token in title_tokens {
            if stem.contains(token) {
                score += 450;
            }
        }
    } else if path.is_file() {
        let size_mb = fs::metadata(path)
            .map(|meta| meta.len() / (1024 * 1024))
            .unwrap_or(0) as i64;
        if (1..=800).contains(&size_mb) {
            score += 120;
        }
        for token in title_tokens {
            if label.contains(token) {
                score += 450;
            }
        }
    }

    if let Some(parent) = path
        .parent()
        .and_then(|dir| dir.file_name())
        .and_then(|name| name.to_str())
    {
        let parent_lower = parent.to_lowercase();
        for token in title_tokens {
            if parent_lower.contains(token) {
                score += 180;
            }
        }
        if parent_lower == "macos" || parent_lower == "bin" || parent_lower == "game" {
            score += 80;
        }
    }

    let path_lower = path.to_string_lossy().to_lowercase();
    for blocked_dir in [
        "frameworks",
        "plugins",
        "plug-ins",
        "_codesignature",
        ".dsym",
        "__macosx",
        "helpers",
        "redist",
        "support",
        "tools",
    ] {
        if path_lower.contains(&format!("/{blocked_dir}/"))
            || path_lower.contains(&format!("\\{blocked_dir}\\"))
        {
            score -= 250;
        }
    }

    score
}
