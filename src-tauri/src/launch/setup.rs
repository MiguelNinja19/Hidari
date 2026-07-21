use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

pub fn find_setup_executable(title: &str, dest_path: &str) -> Option<PathBuf> {
    find_setup_executable_with_extra_roots(title, dest_path, &[])
}

pub(crate) fn pick_shallowest_setup(matches: &mut Vec<(usize, PathBuf)>) -> Option<PathBuf> {
    if matches.is_empty() {
        return None;
    }
    matches.sort_by(|(depth_a, path_a), (depth_b, path_b)| {
        depth_a
            .cmp(depth_b)
            .then_with(|| path_a.as_os_str().cmp(path_b.as_os_str()))
    });
    matches.first().map(|(_, path)| path.clone())
}

pub fn find_setup_executable_with_extra_roots(
    title: &str,
    dest_path: &str,
    extra_roots: &[PathBuf],
) -> Option<PathBuf> {
    find_setup_executable_with_extra_roots_depth(
        title,
        dest_path,
        extra_roots,
        SCAN_DEPTH_FULL,
    )
}

/// Variante barata para refresh da biblioteca (sem varrer depth FULL).
pub fn find_setup_executable_shallow(
    title: &str,
    dest_path: &str,
    extra_roots: &[PathBuf],
) -> Option<PathBuf> {
    find_setup_executable_with_extra_roots_depth(
        title,
        dest_path,
        extra_roots,
        SCAN_DEPTH_FAST,
    )
}

fn find_setup_executable_with_extra_roots_depth(
    title: &str,
    dest_path: &str,
    extra_roots: &[PathBuf],
    max_depth: usize,
) -> Option<PathBuf> {
    let roots = merge_launch_roots(title, dest_path, extra_roots);

    // Caminho rápido: quase todos os repacks têm setup.exe na raiz.
    let mut root_matches: Vec<(usize, PathBuf)> = Vec::new();
    for root in &roots {
        if !root.exists() {
            continue;
        }
        let direct = root.join("setup.exe");
        if is_usable_setup_file(&direct) {
            root_matches.push((0, direct));
        }
    }
    if let Some(setup) = pick_shallowest_setup(&mut root_matches) {
        return Some(setup);
    }

    // Só varre pastas se a raiz não tiver setup.exe.
    let depths: &[usize] = if max_depth <= SCAN_DEPTH_FAST {
        &[SCAN_DEPTH_FAST]
    } else {
        &[SCAN_DEPTH_FAST, SCAN_DEPTH_FULL]
    };
    for &depth in depths {
        if depth > max_depth {
            continue;
        }
        let mut matches: Vec<(usize, PathBuf)> = Vec::new();
        for root in &roots {
            if !root.exists() {
                continue;
            }
            let mut local: Vec<(usize, PathBuf)> = Vec::new();
            collect_executable_candidates(root, 0, depth, &mut local);
            for (d, path) in local {
                let file_name = path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .map(|value| value.to_lowercase())
                    .unwrap_or_default();
                if file_name != "setup.exe" {
                    continue;
                }
                if !is_usable_setup_file(&path) {
                    continue;
                }
                matches.push((d, path));
            }
        }
        if let Some(setup) = pick_shallowest_setup(&mut matches) {
            return Some(setup);
        }
    }

    None
}

pub fn is_usable_setup_path(path: &Path) -> bool {
    is_usable_setup_file(path)
}

pub(crate) fn is_usable_setup_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    let size = fs::metadata(path).map(|meta| meta.len()).unwrap_or(0);
    size >= 50_000
}
