use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

pub(crate) fn launch_roots_for_game(title: &str, dest_path: &str) -> Vec<PathBuf> {
    let content = resolve_game_content_root(title, dest_path);
    let mut roots = vec![content.clone()];

    // Extração só dentro da pasta do próprio jogo — nunca pastas irmãs / outros jogos.
    for org in ["separate-folder", "single-folder"] {
        let extracted = archive::resolve_extract_destination(title, &content, org);
        if !extracted.exists() || roots.iter().any(|root| root == &extracted) {
            continue;
        }
        if is_same_or_under(&extracted, &content) {
            roots.push(extracted);
        }
    }

    roots
}

fn is_same_or_under(path: &Path, root: &Path) -> bool {
    #[cfg(windows)]
    {
        let path_s = path
            .to_string_lossy()
            .trim()
            .trim_end_matches(['\\', '/'])
            .replace('/', "\\")
            .to_ascii_lowercase();
        let root_s = root
            .to_string_lossy()
            .trim()
            .trim_end_matches(['\\', '/'])
            .replace('/', "\\")
            .to_ascii_lowercase();
        path_s == root_s || path_s.starts_with(&(root_s + "\\"))
    }
    #[cfg(not(windows))]
    {
        path == root || path.starts_with(root)
    }
}

pub(crate) fn resolve_job_folder(dest_path: &str) -> PathBuf {
    let path = PathBuf::from(dest_path);
    if path.is_dir() {
        path
    } else {
        path.parent().map(Path::to_path_buf).unwrap_or(path)
    }
}

pub(crate) fn merge_launch_roots(
    title: &str,
    dest_path: &str,
    extra_roots: &[PathBuf],
) -> Vec<PathBuf> {
    let mut roots = launch_roots_for_game(title, dest_path);
    for root in extra_roots {
        // Extra = extract deste job ou game_root que o utilizador escolheu para ESTE jogo.
        if root.exists() && !roots.iter().any(|existing| existing == root) {
            roots.push(root.clone());
        }
    }
    roots
}

pub fn resolve_launch_candidates(title: &str, dest_path: &str) -> Result<Vec<PathBuf>, String> {
    resolve_launch_candidates_with_extra_roots(title, dest_path, &[])
}

pub fn resolve_launch_candidates_with_extra_roots(
    title: &str,
    dest_path: &str,
    extra_roots: &[PathBuf],
) -> Result<Vec<PathBuf>, String> {
    resolve_launch_candidates_with_extra_roots_depth(title, dest_path, extra_roots, SCAN_DEPTH_FULL)
}

pub fn resolve_launch_candidates_with_extra_roots_depth(
    title: &str,
    dest_path: &str,
    extra_roots: &[PathBuf],
    max_depth: usize,
) -> Result<Vec<PathBuf>, String> {
    let roots = merge_launch_roots(title, dest_path, extra_roots);
    resolve_launch_candidates_in_roots(title, &roots, max_depth)
}
