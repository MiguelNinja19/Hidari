use crate::db::open_database_connection;
use crate::dto::RemoveHydraSourcePayload;
use crate::sources::{delete_source_catalog, delete_source_catalog_json_file, get_hydra_source_by_id};
use rusqlite::params;
use tauri::AppHandle;

#[tauri::command]
pub fn remove_download_source(app: AppHandle, payload: RemoveHydraSourcePayload) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  if let Ok(source) = get_hydra_source_by_id(&conn, &payload.id) {
    delete_source_catalog_json_file(&app, &source);
  }
  drop(conn);

  delete_source_catalog(&app, &payload.id);
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "DELETE FROM hydra_download_sources WHERE id = ?1",
      params![payload.id],
    )
    .map_err(|error| format!("could_not_remove_hydra_source: {error}"))?;
  Ok(())
}
