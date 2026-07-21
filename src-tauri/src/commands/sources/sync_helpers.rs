use crate::db::open_database_connection;
use crate::dto::SyncLocalSourceResultDto;
use crate::sources::SyncCatalogOutcome;
use rusqlite::params;
use tauri::AppHandle;

pub(crate) fn persist_source_download_count(app: &AppHandle, source_id: &str, count: usize) {
  if let Ok(conn) = open_database_connection(app) {
    let _ = conn.execute(
      "UPDATE hydra_download_sources SET download_count = ?1 WHERE id = ?2",
      params![count as i64, source_id],
    );
  }
}

pub(crate) fn persist_source_download_count_from_api_priority(
  app: &AppHandle,
  source_id: &str,
  api_count: Option<i64>,
  local_count: usize,
) {
  let count = match api_count.filter(|value| *value > 0) {
    Some(api) => api,
    None => local_count as i64,
  };
  persist_source_download_count(app, source_id, count.max(0) as usize);
}

pub(crate) fn sync_outcome_to_dto(source_id: &str, outcome: SyncCatalogOutcome) -> SyncLocalSourceResultDto {
  match outcome {
    SyncCatalogOutcome::Updated(count) => SyncLocalSourceResultDto {
      source_id: source_id.to_string(),
      download_count: count,
      warning: None,
    },
    SyncCatalogOutcome::Unchanged(count) => SyncLocalSourceResultDto {
      source_id: source_id.to_string(),
      download_count: count,
      warning: Some(format!("Catálogo já está em dia ({count} jogos).")),
    },
    SyncCatalogOutcome::OfflineOnly { count, warning } => SyncLocalSourceResultDto {
      source_id: source_id.to_string(),
      download_count: count,
      warning: Some(warning),
    },
  }
}
