use crate::db::{self, open_database_connection};
use crate::title::{clean_title_for_matching, normalize_title_key};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

fn sidecar_stem(name: &str) -> Option<String> {
    let lower = name.to_ascii_lowercase();
    for suffix in [".torrent", ".aria2"] {
        if let Some(stem) = lower.strip_suffix(suffix) {
            return Some(name[..stem.len()].to_string());
        }
    }
    None
}

pub(crate) fn matches_title(stem: &str, title: &str) -> bool {
    let stem = normalize_title_key(&clean_title_for_matching(stem));
    let title = normalize_title_key(&clean_title_for_matching(title));
    !stem.is_empty()
        && !title.is_empty()
        && (stem == title || title.starts_with(&stem) || stem.starts_with(&title))
}

pub fn maybe_cleanup_torrent_sidecar_files(app: &AppHandle, dest_path: &str, title: &str) {
    let seed_enabled = open_database_connection(app)
        .ok()
        .map(|conn| db::read_app_setting_bool(&conn, "seed_torrents_enabled", true))
        .unwrap_or(true);
    if !seed_enabled {
        cleanup_torrent_sidecar_files(dest_path, title);
    }
}

pub fn cleanup_torrent_sidecar_files(dest_path: &str, title: &str) {
    if dest_path.trim().is_empty() {
        return;
    }
    let target = PathBuf::from(dest_path.trim());
    let folder = if target.is_dir() {
        target.clone()
    } else {
        target.parent().map(Path::to_path_buf).unwrap_or(target)
    };
    if !folder.is_dir() {
        return;
    }
    let folder_name = folder
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    let mut dirs = vec![folder.clone()];
    if let Some(parent) = folder.parent().filter(|parent| parent.is_dir()) {
        dirs.push(parent.to_path_buf());
    }
    for dir in dirs {
        let Ok(entries) = fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let Some(stem) = path.is_file().then(|| sidecar_stem(&name)).flatten() else {
                continue;
            };
            let matched = matches_title(&stem, title)
                || (!folder_name.is_empty()
                    && (stem.eq_ignore_ascii_case(folder_name)
                        || matches_title(&stem, folder_name)));
            if matched {
                if let Err(error) = fs::remove_file(&path) {
                    log::warn!(
                        "could_not_remove_torrent_sidecar {}: {error}",
                        path.display()
                    );
                }
            }
        }
    }
}

#[cfg(test)]
#[path = "torrent_cleanup_tests.rs"]
mod tests;
