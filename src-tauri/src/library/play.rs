use crate::db::{get_default_download_path, open_database_connection};
use crate::dto::LaunchGamePayload;
use crate::launch;
use crate::launch_errors;
use crate::library::roots::{
    launch_extra_roots, read_library_launch_exe, remember_library_game_root,
    upsert_library_launch_exe,
};
use crate::library::uninstall_helpers::find_install_root_from_exe;
use rusqlite::params;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

fn preferred_launch_exe(payload: &LaunchGamePayload, cached: Option<PathBuf>) -> Option<PathBuf> {
    payload
        .preferred_exe
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .or(cached)
}

fn is_shortcut_launch_target(path: &Path) -> bool {
    path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("url") || ext.eq_ignore_ascii_case("lnk"))
}

fn read_internet_shortcut_url(path: &Path) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed
            .strip_prefix("URL=")
            .or_else(|| trimmed.strip_prefix("url="))
        {
            let url = rest.trim();
            if !url.is_empty() {
                return Some(url.to_string());
            }
        }
    }
    None
}

/// Abre o jogo via atalho (.url → steam://…, .lnk) sem bloquear o UI.
fn try_launch_shortcut(path: &Path) -> Result<(), String> {
    if path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("url"))
    {
        if let Some(url) = read_internet_shortcut_url(path) {
            return launch::open_shell_target(&url);
        }
    }
    launch::open_shell_target(&path.to_string_lossy())
}

fn maybe_remember_install_root(
    app: &AppHandle,
    conn: &rusqlite::Connection,
    dest_path: &str,
    title: &str,
    launched: &Path,
) {
    let Some(root) = find_install_root_from_exe(launched) else {
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

fn record_play_stats(conn: &rusqlite::Connection, dest_path: &str, title: &str) {
    let key = format!("{}::{}", dest_path.to_lowercase(), title.to_lowercase());
    let _ = conn.execute(
        "INSERT INTO library_play_stats (path_key, last_played_at, play_count) \
       VALUES (?1, CURRENT_TIMESTAMP, 1) \
       ON CONFLICT(path_key) DO UPDATE SET \
       last_played_at = CURRENT_TIMESTAMP, play_count = play_count + 1",
        params![key],
    );
}

fn persist_shortcut_launch(app: &AppHandle, payload: &LaunchGamePayload, launched: &Path) {
    let Ok(conn) = open_database_connection(app) else {
        return;
    };
    let _ = upsert_library_launch_exe(&conn, &payload.path, &payload.title, launched);
    record_play_stats(&conn, &payload.path, &payload.title);
}

fn persist_exe_launch(app: &AppHandle, payload: &LaunchGamePayload, launched: &Path) {
    let Ok(conn) = open_database_connection(app) else {
        return;
    };
    let _ = upsert_library_launch_exe(&conn, &payload.path, &payload.title, launched);
    maybe_remember_install_root(app, &conn, &payload.path, &payload.title, launched);
    record_play_stats(&conn, &payload.path, &payload.title);
}

#[tauri::command]
pub async fn launch_game_from_path(
    app: AppHandle,
    payload: LaunchGamePayload,
) -> Result<String, String> {
    let _ = crate::path_security::validate_managed_path(&app, &payload.path)?;
    let path_as_file = PathBuf::from(payload.path.trim());

    // Caminho rápido (atalho externo): ShellExecute já; sem fila spawn_blocking.
    if is_shortcut_launch_target(&path_as_file) {
        try_launch_shortcut(&path_as_file)?;
        persist_shortcut_launch(&app, &payload, &path_as_file);
        return Ok(path_as_file.to_string_lossy().to_string());
    }

    let preferred = {
        let conn = open_database_connection(&app)?;
        let cached = read_library_launch_exe(&conn, &payload.path, &payload.title);
        preferred_launch_exe(&payload, cached)
    };

    if let Some(ref exe) = preferred {
        if is_shortcut_launch_target(exe) {
            try_launch_shortcut(exe)?;
            persist_shortcut_launch(&app, &payload, exe);
            return Ok(exe.to_string_lossy().to_string());
        }
        // Já a correr: não relançar (nem esperar scan).
        if launch::is_executable_running(exe) {
            return Ok(exe.to_string_lossy().to_string());
        }
        if launch::try_launch_executable(exe).is_ok() {
            persist_exe_launch(&app, &payload, exe);
            return Ok(exe.to_string_lossy().to_string());
        }
    }

    // Só varrer pastas quando não há alvo conhecido — isto pode ser lento.
    tauri::async_runtime::spawn_blocking(move || {
        let conn = open_database_connection(&app)?;
        let roots = launch_extra_roots(
            &app,
            &payload.title,
            &payload.path,
            payload.job_id.as_deref(),
        );
        let launched = launch::resolve_and_launch_game_with_extra_roots(
            &payload.title,
            &payload.path,
            &roots,
            preferred.as_deref(),
        )
        .map_err(|error| launch_errors::map_launch_user_error(&error, &payload.path))?;
        let _ = upsert_library_launch_exe(&conn, &payload.path, &payload.title, &launched);
        maybe_remember_install_root(&app, &conn, &payload.path, &payload.title, &launched);
        record_play_stats(&conn, &payload.path, &payload.title);
        Ok(launched.to_string_lossy().to_string())
    })
    .await
    .map_err(|error| format!("launch_task_failed: {error}"))?
}

#[tauri::command]
pub fn is_executable_running_at_path(app: AppHandle, path: String) -> bool {
    let path = path.trim();
    !path.is_empty()
        && crate::path_security::validate_managed_path(&app, path).is_ok()
        && launch::is_executable_running(Path::new(path))
}
