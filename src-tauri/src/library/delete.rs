use super::db_cleanup::purge_metadata;
use super::job_cleanup::purge_jobs;
use super::path_match::{normalize_fs_path, same_or_under};
use super::torrent_cleanup::cleanup_torrent_sidecar_files;
use crate::db::{get_default_download_path, open_database_connection};
use crate::dto::DeleteLocalLibraryItemPayload;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub(crate) fn purge_library_item_db(conn: &Connection, path: &str, title: &str) {
    let path = path.trim();
    let title = title.trim();
    if path.is_empty() && title.is_empty() {
        return;
    }
    purge_metadata(conn, path, title);
    purge_jobs(conn, path, title);
}

fn path_under_download_root(target: &Path, base: &Path) -> Result<bool, String> {
    if target.exists() && base.exists() {
        let base = std::fs::canonicalize(base)
            .map_err(|error| format!("could_not_resolve_base_path: {error}"))?;
        let target = std::fs::canonicalize(target)
            .map_err(|error| format!("could_not_resolve_target_path: {error}"))?;
        return Ok(target.starts_with(base));
    }
    Ok(same_or_under(
        &target.to_string_lossy(),
        &base.to_string_lossy(),
    ))
}

#[tauri::command]
pub fn delete_local_library_item(
    app: AppHandle,
    payload: DeleteLocalLibraryItemPayload,
) -> Result<(), String> {
    let default_path = get_default_download_path(&app)?
        .ok_or_else(|| "default_download_path_not_configured".to_string())?;
    let base = PathBuf::from(&default_path);
    let target = PathBuf::from(payload.path.trim());
    let title = payload
        .title
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| {
            target
                .file_stem()
                .and_then(|name| name.to_str())
                .unwrap_or("")
                .to_string()
        });
    if !path_under_download_root(&target, &base)? {
        return Err("path_outside_default_download_path".to_string());
    }
    let is_root = normalize_fs_path(&target.to_string_lossy()) == normalize_fs_path(&default_path)
        || (target.exists()
            && base.exists()
            && std::fs::canonicalize(&target)
                .ok()
                .zip(std::fs::canonicalize(&base).ok())
                .is_some_and(|(a, b)| a == b));
    let cleanup_parent = target.parent().map(Path::to_path_buf);
    if target.exists() && !is_root {
        let target = std::fs::canonicalize(&target)
            .map_err(|error| format!("could_not_resolve_target_path: {error}"))?;
        if target.is_dir() {
            std::fs::remove_dir_all(&target)
                .map_err(|error| format!("could_not_delete_directory: {error}"))?;
        } else {
            std::fs::remove_file(&target)
                .map_err(|error| format!("could_not_delete_file: {error}"))?;
        }
        if !title.is_empty() {
            if let Some(parent) = cleanup_parent {
                cleanup_torrent_sidecar_files(&parent.to_string_lossy(), &title);
            }
        }
    } else if !target.exists() && title.is_empty() {
        return Err("local_item_not_found".to_string());
    } else if is_root && title.is_empty() {
        return Err("cannot_delete_default_download_root".to_string());
    }
    if let Ok(conn) = open_database_connection(&app) {
        purge_library_item_db(&conn, payload.path.trim(), &title);
    }
    Ok(())
}
