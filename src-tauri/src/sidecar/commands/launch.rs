use super::super::engine::fetch_sidecar_job;
use crate::db::open_database_connection;
use crate::launch;
use crate::launch_errors;
use crate::library::roots::{
  launch_extra_roots, read_library_launch_exe, upsert_library_launch_exe,
};
use rusqlite::params;
use tauri::AppHandle;

#[tauri::command]
pub async fn sidecar_launch_job(app: AppHandle, id: String) -> Result<String, String> {
  let job = fetch_sidecar_job(&app, &id).await?;
  let conn = open_database_connection(&app)?;
  let cached_exe = read_library_launch_exe(&conn, &job.dest_path, &job.title);
  let extra_roots = launch_extra_roots(&app, &job.title, &job.dest_path, Some(&id));
  let launched = launch::resolve_and_launch_game_with_extra_roots(
    &job.title,
    &job.dest_path,
    &extra_roots,
    cached_exe.as_deref(),
  )
  .map_err(|error| launch_errors::map_launch_user_error(&error, &job.dest_path))?;
  let _ = upsert_library_launch_exe(&conn, &job.dest_path, &job.title, &launched);
  let path_key = format!(
    "{}::{}",
    job.dest_path.to_lowercase(),
    job.title.to_lowercase()
  );
  let _ = conn.execute(
    "INSERT INTO library_play_stats (path_key, last_played_at, play_count) \
     VALUES (?1, CURRENT_TIMESTAMP, 1) \
     ON CONFLICT(path_key) DO UPDATE SET \
       last_played_at = CURRENT_TIMESTAMP, \
       play_count = play_count + 1",
    params![path_key],
  );
  Ok(launched.to_string_lossy().to_string())
}
