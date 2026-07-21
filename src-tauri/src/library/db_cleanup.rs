use super::notes::library_note_path_key;
use super::path_match::job_matches;
use crate::library::roots::library_entry_key;
use rusqlite::{params, Connection};

fn delete_keyed_metadata(conn: &Connection, path: &str, title: &str) {
    if !path.is_empty() && !title.is_empty() {
        let note_key = library_note_path_key(path, title);
        let library_key = library_entry_key(path, title);
        for table in ["library_notes", "library_play_stats"] {
            let _ = conn.execute(
                &format!("DELETE FROM {table} WHERE path_key = ?1"),
                params![note_key],
            );
        }
        for table in ["library_launch_exe", "library_game_roots"] {
            let _ = conn.execute(
                &format!("DELETE FROM {table} WHERE library_key = ?1"),
                params![library_key],
            );
        }
    }
    if !path.is_empty() {
        let prefix = format!("{}::%", path.to_lowercase());
        for table in ["library_notes", "library_play_stats"] {
            let _ = conn.execute(
                &format!("DELETE FROM {table} WHERE lower(path_key) LIKE ?1"),
                params![prefix],
            );
        }
    }
}

fn delete_matching_library_rows(conn: &Connection, table: &str, path: &str, title: &str) {
    let sql = format!("SELECT library_key, title, dest_path FROM {table}");
    let Ok(mut stmt) = conn.prepare(&sql) else {
        return;
    };
    let Ok(rows) = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    }) else {
        return;
    };
    let keys: Vec<_> = rows
        .flatten()
        .filter(|row| job_matches(path, title, &row.2, &row.1))
        .map(|row| row.0)
        .collect();
    drop(stmt);
    for key in keys {
        let _ = conn.execute(
            &format!("DELETE FROM {table} WHERE library_key = ?1"),
            params![key],
        );
    }
}

pub(crate) fn purge_metadata(conn: &Connection, path: &str, title: &str) {
    delete_keyed_metadata(conn, path, title);
    if !title.is_empty() {
        delete_matching_library_rows(conn, "library_launch_exe", path, title);
        delete_matching_library_rows(conn, "library_game_roots", path, title);
    }
}
