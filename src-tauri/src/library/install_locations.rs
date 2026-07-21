use super::path_match::{same_path, titles_match};
use super::uninstall_helpers::{find_inno_uninstaller, find_install_root_from_exe};
use crate::db::{get_default_download_path, open_database_connection};
use crate::library::roots::{read_library_game_root, read_library_launch_exe};
use crate::title::clean_title_for_matching;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

fn is_filesystem_root_or_shallow(path: &Path) -> bool {
    path.components()
        .filter(|component| matches!(component, std::path::Component::Normal(_)))
        .count()
        == 0
}

pub(crate) fn folder_name_matches_title(folder: &Path, title: &str) -> bool {
    let name = folder
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    !name.is_empty()
        && (titles_match(name, title) || {
            let cleaned = clean_title_for_matching(title);
            !cleaned.is_empty() && titles_match(name, &cleaned)
        })
}

/// Pastas seguras para desinstalar. A pasta do download (content) só entra se tiver unins*.exe.
pub(crate) fn is_safe_install_folder(
    path: &Path,
    download_root: Option<&Path>,
    content_root: &Path,
) -> bool {
    if !path.is_dir() || is_filesystem_root_or_shallow(path) {
        return false;
    }
    if download_root.is_some_and(|root| same_path(path, root)) {
        return false;
    }
    if same_path(path, content_root) {
        return find_inno_uninstaller(path).is_some();
    }
    true
}

fn path_outside_download(path: &Path, download_root: Option<&Path>) -> bool {
    let Some(root) = download_root else {
        return true;
    };
    match (
        std::fs::canonicalize(path),
        std::fs::canonicalize(root),
    ) {
        (Ok(target), Ok(base)) => !target.starts_with(&base),
        _ => !same_path(path, root) && !path.starts_with(root),
    }
}

fn push_unique(out: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !out.iter().any(|path| same_path(path, &candidate)) {
        out.push(candidate);
    }
}

/// Só lista ficheiros unins*.exe — sem scan profundo de .exe do jogo (evita congelar a UI).
fn find_folders_with_uninstaller(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    if !root.is_dir() {
        return found;
    }
    if find_inno_uninstaller(root).is_some() {
        found.push(root.to_path_buf());
    }
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && find_inno_uninstaller(&path).is_some() {
                found.push(path);
            }
        }
    }
    found
}

fn content_roots_for_delete(title: &str, dest_path: &str) -> Vec<PathBuf> {
    let dest = PathBuf::from(dest_path.trim());
    let mut roots = Vec::new();
    if dest.is_dir() {
        roots.push(dest.clone());
    }
    // Filho com nome limpo (repack → pasta instalada ao lado / dentro).
    let cleaned = clean_title_for_matching(title);
    if !cleaned.is_empty() && dest.is_dir() {
        let child = dest.join(&cleaned);
        if child.is_dir() && !same_path(&child, &dest) {
            roots.push(child);
        }
    }
    if let Some(parent) = dest.parent() {
        if !cleaned.is_empty() {
            let sibling = parent.join(&cleaned);
            if sibling.is_dir() && !same_path(&sibling, &dest) {
                roots.push(sibling);
            }
        }
    }
    roots
}

pub fn collect_library_installed_locations(
    app: &AppHandle,
    title: &str,
    dest_path: &str,
) -> Vec<PathBuf> {
    let download_root = get_default_download_path(app)
        .ok()
        .flatten()
        .map(PathBuf::from);
    let content_roots = content_roots_for_delete(title, dest_path);
    let content_root = content_roots
        .first()
        .cloned()
        .unwrap_or_else(|| PathBuf::from(dest_path.trim()));
    let mut out: Vec<PathBuf> = Vec::new();
    let mut push = |candidate: PathBuf| {
        if is_safe_install_folder(&candidate, download_root.as_deref(), &content_root) {
            push_unique(&mut out, candidate);
        }
    };

    for root in &content_roots {
        for folder in find_folders_with_uninstaller(root) {
            push(folder);
        }
    }

    if let Ok(conn) = open_database_connection(app) {
        if let Some(custom) = read_library_game_root(&conn, dest_path, title) {
            for folder in find_folders_with_uninstaller(&custom) {
                push(folder);
            }
            push(custom);
        }
        if let Some(exe) = read_library_launch_exe(&conn, dest_path, title) {
            if let Some(root) = find_install_root_from_exe(&exe) {
                if path_outside_download(&root, download_root.as_deref())
                    || find_inno_uninstaller(&root).is_some()
                {
                    push(root);
                }
            }
        }
    }

    // Irmãs no mesmo pai: só pastas com unins*.exe e nome do jogo (rápido).
    if let Some(parent) = content_root.parent() {
        if let Ok(entries) = std::fs::read_dir(parent) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir()
                    && !same_path(&path, &content_root)
                    && find_inno_uninstaller(&path).is_some()
                    && folder_name_matches_title(&path, title)
                {
                    push(path);
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let cleaned = clean_title_for_matching(title);
        if !cleaned.is_empty() {
            let mut bases: Vec<PathBuf> = Vec::new();
            if let Some(pf) = std::env::var_os("ProgramFiles") {
                bases.push(PathBuf::from(pf));
            }
            if let Some(pf86) = std::env::var_os("ProgramFiles(x86)") {
                bases.push(PathBuf::from(pf86));
            }
            if let Some(local) = std::env::var_os("LOCALAPPDATA") {
                bases.push(PathBuf::from(local).join("Programs"));
            }
            for base in bases {
                let candidate = base.join(&cleaned);
                // Só se existir unins — sem varrer .exe do jogo.
                if candidate.is_dir() && find_inno_uninstaller(&candidate).is_some() {
                    push(candidate);
                }
            }
        }
    }

    out
}
