use super::sync_helpers::{
  persist_source_download_count_from_api_priority, sync_outcome_to_dto,
};
use crate::db::open_database_connection;
use crate::dto::{SyncLocalSourcePayload, SyncLocalSourceResultDto};
use crate::sources::{
  get_hydra_source_by_id, is_syncable_catalog_source, persist_hydra_api_meta,
  sync_source_catalog_from_remote,
};
use rusqlite::params;
use tauri::AppHandle;

#[tauri::command]
pub async fn sync_local_source_catalog(
  app: AppHandle,
  payload: SyncLocalSourcePayload,
) -> Result<SyncLocalSourceResultDto, String> {
  let conn = open_database_connection(&app)?;
  let source = get_hydra_source_by_id(&conn, &payload.id)?;
  drop(conn);

  if !is_syncable_catalog_source(&source) {
    return Err(
      "Só é possível atualizar fontes com catálogo local ou URL remota configurada.".to_string(),
    );
  }

  let outcome = sync_source_catalog_from_remote(&app, &source).await?;
  let api_count = outcome.1.as_ref().map(|meta| meta.download_count);
  if let Some(api) = &outcome.1 {
    if let Ok(conn) = open_database_connection(&app) {
      let _ = persist_hydra_api_meta(&conn, &source.id, api);
    }
  }
  let mut dto = sync_outcome_to_dto(&source.id, outcome.0);
  persist_source_download_count_from_api_priority(
    &app,
    &source.id,
    api_count,
    dto.download_count,
  );
  if let Some(api) = api_count.filter(|value| *value > 0) {
    dto.download_count = api.max(0) as usize;
  }
  if dto.warning.is_none() {
    if let Ok(conn) = open_database_connection(&app) {
      let hash = conn
        .query_row(
          "SELECT COALESCE(payload_hash, '') FROM hydra_source_catalogs WHERE source_id = ?1",
          params![source.id],
          |row| row.get::<_, String>(0),
        )
        .unwrap_or_default();
      crate::catalog::record_catalog_snapshot(&conn, &source.id, dto.download_count as i64, &hash);
    }
    if let Ok(n) = crate::covers::bulk_resolve_catalog_covers_from_index(&app) {
      if n > 0 {
        eprintln!("catalog_covers_resolved_on_sync: {n}");
      }
    }
  }
  Ok(dto)
}
