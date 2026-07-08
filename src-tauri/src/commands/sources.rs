use crate::db::{get_disabled_hydra_source_ids_from_conn, open_database_connection};
use crate::dto::*;
use crate::sources::{
  create_hydra_source, delete_source_catalog, get_hydra_source_by_id, import_source_catalog_from_file,
  is_local_catalog_path, list_hydra_sources, persist_hydra_api_meta, search_download_options_from_local_sources,
  sync_source_catalog_from_remote, upsert_hydra_source, validate_source_url, SyncCatalogOutcome,
};
use rusqlite::params;
use tauri::AppHandle;

#[tauri::command]
pub async fn search_download_options(
  app: AppHandle,
  payload: SearchDownloadOptionsPayload,
) -> Result<Vec<DownloadOptionDto>, String> {
  let query = payload.query.trim();
  if query.len() < 2 {
    return Ok(Vec::new());
  }

  let conn = open_database_connection(&app)?;
  let hydra_sources = list_hydra_sources(&conn)?;
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn)?;
  drop(conn);

  let active_sources: Vec<HydraSourceDto> = hydra_sources
    .into_iter()
    .filter(|source| !disabled.contains(&source.id))
    .collect();

  if active_sources.is_empty() {
    return Ok(Vec::new());
  }

  Ok(search_download_options_from_local_sources(&app, query, &active_sources).await)
}

#[tauri::command]
pub async fn add_download_source(
  app: AppHandle,
  payload: AddDownloadSourcePayload,
) -> Result<HydraSourceDto, String> {
  validate_source_url(&payload.url)?;
  let input = payload.url.trim();

  if input.starts_with("http://") || input.starts_with("https://") {
    return Err(
      "Use \"Buscar\" para escolher um arquivo .json local (ex.: fitgirl.json).".to_string(),
    );
  }

  if !is_local_catalog_path(input) {
    return Err(
      "Escolha um arquivo .json existente no disco com \"Buscar\".".to_string(),
    );
  }

  let source = create_hydra_source(input, None);
  let conn = open_database_connection(&app)?;
  upsert_hydra_source(&conn, &source)?;
  drop(conn);

  let download_count = match import_source_catalog_from_file(&app, &source.id, input) {
    Ok(count) => count,
    Err(error) => {
      delete_source_catalog(&app, &source.id);
      if let Ok(conn) = open_database_connection(&app) {
        let _ = conn.execute(
          "DELETE FROM hydra_download_sources WHERE id = ?1",
          params![source.id],
        );
      }
      return Err(error);
    }
  };

  if let Ok(conn) = open_database_connection(&app) {
    let _ = conn.execute(
      "UPDATE hydra_download_sources SET download_count = ?1 WHERE id = ?2",
      params![download_count as i64, source.id],
    );
  }

  let mut source = source;
  source.download_count = download_count as i64;
  if let Ok(n) = crate::covers::bulk_resolve_catalog_covers_from_index(&app) {
    if n > 0 {
      eprintln!("catalog_covers_resolved_on_import: {n}");
    }
  }
  Ok(source)
}

#[tauri::command]
pub fn get_download_sources(app: AppHandle) -> Result<Vec<HydraSourceDto>, String> {
  let conn = open_database_connection(&app)?;
  list_hydra_sources(&conn)
}

#[tauri::command]
pub async fn sync_download_sources(app: AppHandle) -> Result<Vec<HydraSourceDto>, String> {
  sync_all_local_source_catalogs(app.clone()).await?;
  let conn = open_database_connection(&app)?;
  list_hydra_sources(&conn)
}

fn persist_source_download_count(app: &AppHandle, source_id: &str, count: usize) {
  if let Ok(conn) = open_database_connection(app) {
    let _ = conn.execute(
      "UPDATE hydra_download_sources SET download_count = ?1 WHERE id = ?2",
      params![count as i64, source_id],
    );
  }
}

fn sync_outcome_to_dto(source_id: &str, outcome: SyncCatalogOutcome) -> SyncLocalSourceResultDto {
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

#[tauri::command]
pub async fn sync_local_source_catalog(
  app: AppHandle,
  payload: SyncLocalSourcePayload,
) -> Result<SyncLocalSourceResultDto, String> {
  let conn = open_database_connection(&app)?;
  let source = get_hydra_source_by_id(&conn, &payload.id)?;
  drop(conn);

  if !is_local_catalog_path(&source.url) {
    return Err(
      "Só é possível atualizar fontes importadas a partir de um arquivo .json local.".to_string(),
    );
  }

  let outcome = sync_source_catalog_from_remote(&app, &source).await?;
  if let Some(api) = &outcome.1 {
    if let Ok(conn) = open_database_connection(&app) {
      let _ = persist_hydra_api_meta(&conn, &source.id, api);
    }
  }
  let dto = sync_outcome_to_dto(&source.id, outcome.0);
  if dto.warning.is_none() {
    persist_source_download_count(&app, &source.id, dto.download_count);
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
    if !is_local_catalog_path(&source.url) {
      continue;
    }

    match sync_source_catalog_from_remote(&app, &source).await {
      Ok((outcome @ SyncCatalogOutcome::Unchanged(_), api)) => {
        if let Some(meta) = api {
          if let Ok(conn) = open_database_connection(&app) {
            let _ = persist_hydra_api_meta(&conn, &source.id, &meta);
          }
        }
        unchanged_count += 1;
        synced.push(sync_outcome_to_dto(&source.id, outcome));
      }
      Ok((outcome @ SyncCatalogOutcome::Updated(count), api)) => {
        if let Some(meta) = api {
          if let Ok(conn) = open_database_connection(&app) {
            let _ = persist_hydra_api_meta(&conn, &source.id, &meta);
          }
        }
        persist_source_download_count(&app, &source.id, count);
        synced.push(sync_outcome_to_dto(&source.id, outcome));
      }
      Ok((outcome @ SyncCatalogOutcome::OfflineOnly { .. }, api)) => {
        if let Some(meta) = api {
          if let Ok(conn) = open_database_connection(&app) {
            let _ = persist_hydra_api_meta(&conn, &source.id, &meta);
          }
        }
        synced.push(sync_outcome_to_dto(&source.id, outcome));
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

#[tauri::command]
pub fn remove_download_source(app: AppHandle, payload: RemoveHydraSourcePayload) -> Result<(), String> {
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
