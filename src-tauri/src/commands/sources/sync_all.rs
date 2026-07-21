use super::sync_helpers::{
  persist_source_download_count_from_api_priority, sync_outcome_to_dto,
};
use crate::db::open_database_connection;
use crate::dto::{
  SyncAllLocalSourcesResultDto, SyncLocalSourceFailureDto, SyncLocalSourceResultDto,
};
use crate::sources::{
  is_syncable_catalog_source, list_hydra_sources, persist_hydra_api_meta, sync_source_catalog_from_remote,
  SyncCatalogOutcome,
};
use tauri::AppHandle;

fn apply_sync_outcome(
  app: &AppHandle,
  source_id: &str,
  outcome: SyncCatalogOutcome,
  api_count: Option<i64>,
) -> SyncLocalSourceResultDto {
  persist_source_download_count_from_api_priority(app, source_id, api_count, match &outcome {
    SyncCatalogOutcome::Updated(count) | SyncCatalogOutcome::Unchanged(count) => *count,
    SyncCatalogOutcome::OfflineOnly { count, .. } => *count,
  });
  let mut dto = sync_outcome_to_dto(source_id, outcome);
  if let Some(api) = api_count.filter(|value| *value > 0) {
    dto.download_count = api.max(0) as usize;
  }
  dto
}

#[tauri::command]
pub async fn sync_all_local_source_catalogs(
  app: AppHandle,
) -> Result<SyncAllLocalSourcesResultDto, String> {
  let conn = open_database_connection(&app)?;
  let sources = list_hydra_sources(&conn)?;
  drop(conn);

  let mut synced = Vec::new();
  let mut failures = Vec::new();
  let mut unchanged_count = 0usize;

  for source in sources {
    if !is_syncable_catalog_source(&source) {
      continue;
    }

    match sync_source_catalog_from_remote(&app, &source).await {
      Ok((outcome, api)) => {
        let api_count = api.as_ref().map(|meta| meta.download_count);
        if let Some(meta) = &api {
          if let Ok(conn) = open_database_connection(&app) {
            let _ = persist_hydra_api_meta(&conn, &source.id, meta);
          }
        }
        if matches!(outcome, SyncCatalogOutcome::Unchanged(_)) {
          unchanged_count += 1;
        }
        synced.push(apply_sync_outcome(&app, &source.id, outcome, api_count));
      }
      Err(message) => failures.push(SyncLocalSourceFailureDto {
        source_id: source.id,
        source_name: source.name,
        message,
      }),
    }
  }

  let has_updates = synced.iter().any(|item| item.warning.is_none());
  if has_updates {
    if let Ok(n) = crate::covers::bulk_resolve_catalog_covers_from_index(&app) {
      if n > 0 {
        eprintln!("catalog_covers_resolved_on_sync_all: {n}");
      }
    }
  }

  Ok(SyncAllLocalSourcesResultDto {
    synced,
    failures,
    unchanged_count,
  })
}
