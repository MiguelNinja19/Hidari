use super::sync_all::sync_all_local_source_catalogs;
use crate::db::open_database_connection;
use crate::dto::HydraSourceDto;
use crate::sources::list_hydra_sources;
use tauri::AppHandle;

#[tauri::command]
pub async fn sync_download_sources(app: AppHandle) -> Result<Vec<HydraSourceDto>, String> {
  sync_all_local_source_catalogs(app.clone()).await?;
  let conn = open_database_connection(&app)?;
  list_hydra_sources(&conn)
}
