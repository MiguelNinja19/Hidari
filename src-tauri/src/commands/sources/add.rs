use super::{add_local, add_remote};
use crate::dto::{AddDownloadSourcePayload, HydraSourceDto};
use crate::sources::{is_local_catalog_path, is_remote_catalog_url, validate_source_url};
use tauri::AppHandle;

#[tauri::command]
pub async fn add_download_source(
  app: AppHandle,
  payload: AddDownloadSourcePayload,
) -> Result<HydraSourceDto, String> {
  validate_source_url(&payload.url)?;
  let input = payload.url.trim();

  if is_remote_catalog_url(input) {
    return add_remote::import(app, input).await;
  }

  if !is_local_catalog_path(input) {
    return Err(
      "Cole uma URL de catálogo .json (ex.: hydralinks.cloud/sources/fitgirl.json) \
ou escolha um arquivo local com \"Importar\".".to_string(),
    );
  }

  add_local::import(app, input).await
}

pub(crate) fn rollback_failed_source(app: &AppHandle, source_id: &str) {
  use crate::db::open_database_connection;
  use crate::sources::delete_source_catalog;
  use rusqlite::params;

  delete_source_catalog(app, source_id);
  if let Ok(conn) = open_database_connection(app) {
    let _ = conn.execute(
      "DELETE FROM hydra_download_sources WHERE id = ?1",
      params![source_id],
    );
  }
}

pub(crate) fn resolve_covers_after_import(app: &AppHandle) {
  if let Ok(n) = crate::covers::bulk_resolve_catalog_covers_from_index(app) {
    if n > 0 {
      eprintln!("catalog_covers_resolved_on_import: {n}");
    }
  }
}
