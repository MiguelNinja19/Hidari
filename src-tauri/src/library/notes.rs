use crate::db::open_database_connection;
use crate::dto::LibraryNotePayload;
use rusqlite::params;
use tauri::AppHandle;

pub(crate) fn library_note_path_key(path: &str, title: &str) -> String {
    format!("{}::{}", path.to_lowercase(), title.to_lowercase())
}

#[tauri::command]
pub fn get_library_note(app: AppHandle, payload: LibraryNotePayload) -> Result<String, String> {
    let path = payload.path.trim();
    let title = payload.title.trim();
    if path.is_empty() || title.is_empty() {
        return Ok(String::new());
    }
    let conn = open_database_connection(&app)?;
    Ok(conn
        .query_row(
            "SELECT note FROM library_notes WHERE path_key = ?1",
            params![library_note_path_key(path, title)],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_default())
}

#[tauri::command]
pub fn set_library_note(app: AppHandle, payload: LibraryNotePayload) -> Result<(), String> {
    let path = payload.path.trim();
    let title = payload.title.trim();
    if path.is_empty() || title.is_empty() {
        return Err("library_note_path_or_title_empty".to_string());
    }
    let note = payload.note.unwrap_or_default();
    let conn = open_database_connection(&app)?;
    let key = library_note_path_key(path, title);
    if note.trim().is_empty() {
        conn.execute(
            "DELETE FROM library_notes WHERE path_key = ?1",
            params![key],
        )
        .map_err(|error| format!("could_not_clear_library_note: {error}"))?;
    } else {
        conn.execute(
            "INSERT INTO library_notes (path_key, note) VALUES (?1, ?2) \
         ON CONFLICT(path_key) DO UPDATE SET note = excluded.note",
            params![key, note],
        )
        .map_err(|error| format!("could_not_save_library_note: {error}"))?;
    }
    Ok(())
}
