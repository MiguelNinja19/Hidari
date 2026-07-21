use crate::db::open_database_connection;
use crate::dto::LibraryPlayStatDto;
use tauri::AppHandle;

#[tauri::command]
pub fn list_library_play_stats(app: AppHandle) -> Result<Vec<LibraryPlayStatDto>, String> {
    let conn = open_database_connection(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT path_key, last_played_at, play_count FROM library_play_stats \
       ORDER BY datetime(last_played_at) DESC, play_count DESC",
        )
        .map_err(|e| format!("could_not_list_play_stats: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(LibraryPlayStatDto {
                path_key: row.get(0)?,
                last_played_at: row.get(1)?,
                play_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("could_not_map_play_stats: {e}"))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("could_not_read_play_stat: {e}"))?);
    }
    Ok(out)
}
