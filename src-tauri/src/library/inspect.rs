use crate::archive;
use crate::db::{get_default_download_path, open_database_connection};
use crate::dto::{LaunchGamePayload, LibraryPathStateDto};
use crate::launch;
use crate::library::roots::{
    clear_library_launch_exe, launch_extra_roots, read_library_game_root,
    remember_library_game_root, upsert_library_launch_exe,
};
use crate::library::uninstall_helpers::find_install_root_from_exe;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

fn maybe_remember_install_root_from_exe(
    app: &AppHandle,
    conn: &rusqlite::Connection,
    dest_path: &str,
    title: &str,
    exe: &Path,
) {
    let Some(root) = find_install_root_from_exe(exe) else {
        return;
    };
    let download_root = get_default_download_path(app)
        .ok()
        .flatten()
        .map(PathBuf::from);
    let outside = match (
        download_root
            .as_ref()
            .and_then(|base| std::fs::canonicalize(base).ok()),
        std::fs::canonicalize(&root).ok(),
    ) {
        (Some(base), Some(target)) => !target.starts_with(&base),
        (Some(base), None) => !root.starts_with(base),
        _ => true,
    };
    if outside {
        let _ = remember_library_game_root(conn, dest_path, title, &root);
    }
}

pub fn inspect_library_path_internal(
    app: &AppHandle,
    title: &str,
    path: &str,
    job_id: Option<&str>,
) -> LibraryPathStateDto {
    let roots = launch_extra_roots(app, title, path, job_id);
    let custom_game_root = open_database_connection(app)
        .ok()
        .and_then(|conn| read_library_game_root(&conn, path, title))
        .map(|path| path.to_string_lossy().to_string());
    let content_path = launch::resolve_game_content_root(title, path)
        .to_string_lossy()
        .to_string();
    let candidates = launch::resolve_launch_candidates_with_extra_roots(title, path, &roots);

    #[cfg(not(target_os = "macos"))]
    let install_path = launch::find_setup_executable_with_extra_roots(title, path, &roots)
        .map(|path| path.to_string_lossy().to_string());
    #[cfg(target_os = "macos")]
    let install_path = None::<String>;

    let mut has_game = candidates.is_ok();
    if let Some(root) = &custom_game_root {
        if launch::folder_has_playable_game(title, Path::new(root)) {
            has_game = true;
        }
    }

    // Guarda o .exe já na inspeção — o 1.º "Jogar" usa isto e não volta a varrer a pasta.
    let mut launch_path: Option<PathBuf> = candidates
        .as_ref()
        .ok()
        .and_then(|items| items.first().cloned());
    if launch_path.is_none() {
        if let Some(root) = &custom_game_root {
            launch_path = launch::resolve_launch_candidates_with_extra_roots(title, root, &[])
                .ok()
                .and_then(|items| items.into_iter().next());
        }
    }

    if has_game {
        if let Some(ref exe) = launch_path {
            if let Ok(conn) = open_database_connection(app) {
                let _ = upsert_library_launch_exe(&conn, path, title, exe);
                maybe_remember_install_root_from_exe(app, &conn, path, title, exe);
            }
        }
    }

    let needs_install = !has_game && install_path.is_some();
    if needs_install {
        if let Ok(conn) = open_database_connection(app) {
            let _ = clear_library_launch_exe(&conn, path, title);
        }
        launch_path = None;
    }

    let needs_extraction =
        !has_game && install_path.is_none() && archive::find_job_archive(&content_path).is_some();

    LibraryPathStateDto {
        has_game,
        needs_install,
        install_path,
        needs_extraction,
        playable: has_game,
        custom_game_root,
        launch_path: launch_path.map(|p| p.to_string_lossy().to_string()),
    }
}

#[tauri::command]
pub fn inspect_library_path(app: AppHandle, payload: LaunchGamePayload) -> LibraryPathStateDto {
    inspect_library_path_internal(
        &app,
        &payload.title,
        &payload.path,
        payload.job_id.as_deref(),
    )
}
