use super::roots::library_entry_key;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::{Path, PathBuf};

pub fn read_library_launch_exe(conn: &Connection, dest_path: &str, title: &str) -> Option<PathBuf> {
    let key = library_entry_key(dest_path, title);
    conn.query_row(
        "SELECT exe_path FROM library_launch_exe WHERE library_key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
    .map(PathBuf::from)
    .filter(|path| path.is_file())
}

pub fn upsert_library_launch_exe(
    conn: &Connection,
    dest_path: &str,
    title: &str,
    exe_path: &Path,
) -> Result<(), String> {
    let key = library_entry_key(dest_path, title);
    conn.execute(
        "INSERT INTO library_launch_exe (library_key, title, dest_path, exe_path, updated_at) \
       VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP) \
       ON CONFLICT(library_key) DO UPDATE SET \
         title = excluded.title, dest_path = excluded.dest_path, \
         exe_path = excluded.exe_path, updated_at = CURRENT_TIMESTAMP",
        params![
            key,
            title,
            dest_path.trim(),
            exe_path.to_string_lossy().to_string()
        ],
    )
    .map_err(|error| format!("could_not_save_library_launch_exe: {error}"))?;
    Ok(())
}

pub fn clear_library_launch_exe(
    conn: &Connection,
    dest_path: &str,
    title: &str,
) -> Result<(), String> {
    let key = library_entry_key(dest_path, title);
    conn.execute(
        "DELETE FROM library_launch_exe WHERE library_key = ?1",
        params![key],
    )
    .map_err(|error| format!("could_not_clear_library_launch_exe: {error}"))?;
    Ok(())
}
