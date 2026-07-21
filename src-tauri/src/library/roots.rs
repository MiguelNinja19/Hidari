use crate::db::{extraction_roots_for_job, open_database_connection};
use crate::title;
use rusqlite::OptionalExtension;
use rusqlite::{params, Connection};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub use super::launch_records::{
    clear_library_launch_exe, read_library_launch_exe, upsert_library_launch_exe,
};
pub use super::open_path::open_path_in_shell;

pub fn library_entry_key(dest_path: &str, title: &str) -> String {
    let mut hasher = DefaultHasher::new();
    dest_path.trim().to_lowercase().hash(&mut hasher);
    title::normalize_title_key(title).hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

pub fn read_library_game_root(conn: &Connection, dest_path: &str, title: &str) -> Option<PathBuf> {
    let key = library_entry_key(dest_path, title);
    conn.query_row(
        "SELECT game_root FROM library_game_roots WHERE library_key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
    .map(PathBuf::from)
    .filter(|path| path.is_dir())
}

pub fn upsert_library_game_root(
    conn: &Connection,
    dest_path: &str,
    title: &str,
    game_root: &Path,
) -> Result<(), String> {
    remember_library_game_root(conn, dest_path, title, game_root)?;
    let _ = clear_library_launch_exe(conn, dest_path, title);
    Ok(())
}

/// Guarda a pasta de instalação sem limpar o .exe em cache (Play / inspect).
pub fn remember_library_game_root(
    conn: &Connection,
    dest_path: &str,
    title: &str,
    game_root: &Path,
) -> Result<(), String> {
    let key = library_entry_key(dest_path, title);
    conn.execute(
        "INSERT INTO library_game_roots (library_key, title, dest_path, game_root, updated_at) \
       VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP) \
       ON CONFLICT(library_key) DO UPDATE SET \
         title = excluded.title, \
         dest_path = excluded.dest_path, \
         game_root = excluded.game_root, \
         updated_at = CURRENT_TIMESTAMP",
        params![
            key,
            title,
            dest_path.trim(),
            game_root.to_string_lossy().to_string()
        ],
    )
    .map_err(|error| format!("could_not_save_library_game_root: {error}"))?;
    crate::path_security::invalidate_managed_roots_cache();
    Ok(())
}

pub fn stored_game_roots_for(app: &AppHandle, title: &str, dest_path: &str) -> Vec<PathBuf> {
    let Ok(conn) = open_database_connection(app) else {
        return Vec::new();
    };
    read_library_game_root(&conn, dest_path, title)
        .map(|path| vec![path])
        .unwrap_or_default()
}

pub fn launch_extra_roots(
    app: &AppHandle,
    title: &str,
    dest_path: &str,
    job_id: Option<&str>,
) -> Vec<PathBuf> {
    let mut roots = job_id
        .map(|id| extraction_roots_for_job(app, id))
        .unwrap_or_default();
    for root in stored_game_roots_for(app, title, dest_path) {
        if !roots.iter().any(|existing| existing == &root) {
            roots.push(root);
        }
    }
    roots
}
