use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn resolve_launch_candidates_in_roots_mac(
    title: &str,
    roots: &[PathBuf],
    max_depth: usize,
) -> Result<Vec<PathBuf>, String> {
    let title_tokens = title::tokenize_title(title);
    let mut scored: Vec<(i64, PathBuf)> = Vec::new();
    let mut seen_paths = std::collections::HashSet::new();
    let mut any_root_exists = false;

    for root in roots {
        if !root.exists() {
            continue;
        }
        any_root_exists = true;

        let mut local: Vec<(usize, PathBuf)> = Vec::new();
        collect_mac_launch_candidates(root, 0, max_depth, &mut local);

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

            let key = path.to_string_lossy().to_lowercase();
            if !seen_paths.insert(key) {
                continue;
            }

            let score = score_mac_launch_candidate(&path, depth, &title_tokens);
            scored.push((score, path));
        }
    }

    if !any_root_exists {
        return Err("launch_target_root_not_found".to_string());
    }
    if scored.is_empty() {
        return Err("no_executable_found_in_job_folder".to_string());
    }

    if !title_tokens.is_empty() {
        let title_matched: Vec<(i64, PathBuf)> = scored
            .iter()
            .filter(|(_, path)| path_matches_title_tokens(path, &title_tokens))
            .cloned()
            .collect();
        if title_matched.is_empty() {
            return Err("no_executable_found_in_job_folder".to_string());
        }
        scored = title_matched;
    }

    scored.sort_by(|(score_a, path_a), (score_b, path_b)| {
        score_b
            .cmp(score_a)
            .then_with(|| path_a.as_os_str().cmp(path_b.as_os_str()))
    });

    Ok(scored.into_iter().map(|(_, path)| path).collect())
}
