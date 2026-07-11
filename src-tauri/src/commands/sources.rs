use crate::db::{get_disabled_hydra_source_ids_from_conn, open_database_connection};
use crate::dto::*;
use crate::library::roots::open_path_in_shell;
use crate::sources::{
  catalog_cache_dir, catalog_cache_path_for_remote_url, count_hydra_catalog_entries,
  create_hydra_source, create_hydra_source_from_remote, delete_source_catalog,
  delete_source_catalog_json_file, get_hydra_source_by_id, hydra_refresh_download_source_meta,
  hydralinks_remote_url_for_local_path, import_source_catalog_from_remote_url,
  is_local_catalog_path, is_remote_catalog_url, finalize_local_catalog_import,
  is_syncable_catalog_source, list_hydra_sources, list_download_options_for_group_key,
  load_cached_catalog_for_source, migrate_external_catalog_to_cache_if_needed,
  normalize_remote_catalog_url, persist_hydra_api_meta, persist_hydra_source_display_name,
  resolve_source_display_name, search_download_options_from_local_sources,
  stage_local_catalog_for_import, sync_source_catalog_from_remote, upsert_hydra_source,
  validate_source_url, SyncCatalogOutcome,
};
use crate::title::catalog_game_group_key;
use rusqlite::params;
use tauri::AppHandle;

#[tauri::command]
pub async fn search_download_options(
  app: AppHandle,
  payload: SearchDownloadOptionsPayload,
) -> Result<Vec<DownloadOptionDto>, String> {
  let query = payload.query.trim();

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

  let group_key = payload
    .group_key
    .as_ref()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());

  if let Some(ref group_key) = group_key {
    let by_key = list_download_options_for_group_key(&app, &active_sources, group_key);
    if !by_key.is_empty() {
      return Ok(by_key);
    }
  }

  if query.len() < 2 {
    if let Some(ref group_key) = group_key {
      return Ok(list_download_options_for_group_key(&app, &active_sources, group_key));
    }
    return Ok(Vec::new());
  }

  let options =
    search_download_options_from_local_sources(&app, query, &active_sources).await;

  if let Some(ref group_key) = group_key {
    let filtered: Vec<DownloadOptionDto> = options
      .into_iter()
      .filter(|option| catalog_game_group_key(&option.title) == *group_key)
      .collect();
    if !filtered.is_empty() {
      return Ok(filtered);
    }
    return Ok(list_download_options_for_group_key(&app, &active_sources, group_key));
  }

  Ok(options)
}

#[tauri::command]
pub async fn add_download_source(
  app: AppHandle,
  payload: AddDownloadSourcePayload,
) -> Result<HydraSourceDto, String> {
  validate_source_url(&payload.url)?;
  let input = payload.url.trim();

  if is_remote_catalog_url(input) {
    let remote_url = normalize_remote_catalog_url(input)?;
    let cache_path = catalog_cache_path_for_remote_url(&app, &remote_url)?;
    let cache_path_str = cache_path.to_string_lossy().into_owned();
    let source = create_hydra_source_from_remote(&remote_url, &cache_path_str);

    let conn = open_database_connection(&app)?;
    upsert_hydra_source(&conn, &source)?;
    drop(conn);

    let (download_count, api_meta) =
      match import_source_catalog_from_remote_url(&app, &source.id, &remote_url, &cache_path_str).await
      {
        Ok(result) => result,
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

    if let Some(ref api) = api_meta {
      if let Ok(conn) = open_database_connection(&app) {
        let _ = persist_hydra_api_meta(&conn, &source.id, api);
      }
    }

    // Prioridade: quantidade da API Hydra; local só como fallback.
    let preferred_count = api_meta
      .as_ref()
      .map(|meta| meta.download_count)
      .filter(|value| *value > 0)
      .unwrap_or(download_count as i64)
      .max(0);
    if let Ok(conn) = open_database_connection(&app) {
      let _ = conn.execute(
        "UPDATE hydra_download_sources SET download_count = ?1 WHERE id = ?2",
        params![preferred_count, source.id],
      );
    }

    let source = if let Ok(conn) = open_database_connection(&app) {
      get_hydra_source_by_id(&conn, &source.id).unwrap_or_else(|_| {
        let mut fallback = source;
        fallback.download_count = preferred_count;
        fallback
      })
    } else {
      let mut fallback = source;
      fallback.download_count = preferred_count;
      fallback
    };
    if let Ok(n) = crate::covers::bulk_resolve_catalog_covers_from_index(&app) {
      if n > 0 {
        eprintln!("catalog_covers_resolved_on_import: {n}");
      }
    }
    let _ = load_cached_catalog_for_source(&app, &source);
    return Ok(source);
  }

  if !is_local_catalog_path(input) {
    return Err(
      "Cole uma URL de catálogo .json (ex.: hydralinks.cloud/sources/fitgirl.json) \
ou escolha um arquivo local com \"Importar\".".to_string(),
    );
  }

  let remote_url = hydralinks_remote_url_for_local_path(input);
  let staged = stage_local_catalog_for_import(&app, input)?;
  let source = create_hydra_source(&staged.cache_path, remote_url.as_deref());
  let conn = open_database_connection(&app)?;
  upsert_hydra_source(&conn, &source)?;
  drop(conn);

  if let Err(error) = finalize_local_catalog_import(&app, &source.id, &staged) {
    delete_source_catalog(&app, &source.id);
    if let Ok(conn) = open_database_connection(&app) {
      let _ = conn.execute(
        "DELETE FROM hydra_download_sources WHERE id = ?1",
        params![source.id],
      );
    }
    return Err(error);
  }

  let mut source = source;
  source.download_count = staged.count as i64;
  if let Ok(conn) = open_database_connection(&app) {
    let _ = conn.execute(
      "UPDATE hydra_download_sources SET download_count = ?1 WHERE id = ?2",
      params![staged.count as i64, source.id],
    );
    if let Ok(fresh) = get_hydra_source_by_id(&conn, &source.id) {
      source = fresh;
    }
  }
  if let Ok(n) = crate::covers::bulk_resolve_catalog_covers_from_index(&app) {
    if n > 0 {
      eprintln!("catalog_covers_resolved_on_import: {n}");
    }
  }
  let _ = load_cached_catalog_for_source(&app, &source);
  Ok(source)
}

#[tauri::command]
pub async fn get_download_sources(app: AppHandle) -> Result<Vec<HydraSourceDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut sources = list_hydra_sources(&conn)?;
  drop(conn);

  // Atualiza contagens a partir da API Hydra (prioridade sobre o JSON local).
  let mut join_set = tokio::task::JoinSet::new();
  for source in &sources {
    let Some(remote) = source
      .remote_url
      .as_ref()
      .map(|value| value.trim().to_string())
      .filter(|value| !value.is_empty())
    else {
      continue;
    };
    let source_id = source.id.clone();
    let api_id = source.api_source_id.clone();
    let fingerprint = source.fingerprint.clone();
    join_set.spawn(async move {
      let meta = hydra_refresh_download_source_meta(
        &remote,
        api_id.as_deref(),
        fingerprint.as_deref(),
      )
      .await
      .ok()?;
      Some((source_id, meta))
    });
  }

  while let Some(joined) = join_set.join_next().await {
    let Ok(Some((source_id, meta))) = joined else {
      continue;
    };
    if let Ok(conn) = open_database_connection(&app) {
      let _ = persist_hydra_api_meta(&conn, &source_id, &meta);
    }
    if let Some(source) = sources.iter_mut().find(|item| item.id == source_id) {
      if meta.download_count > 0 {
        source.download_count = meta.download_count;
      }
      if !meta.id.is_empty() {
        source.api_source_id = Some(meta.id);
      }
      if let Some(fp) = meta.fingerprint.clone() {
        source.fingerprint = Some(fp);
      }
      let better = resolve_source_display_name(None, Some(meta.name.as_str()), meta.name.as_str());
      if !better.is_empty() {
        source.name = better;
      }
    }
  }

  for source in &mut sources {
    if let Ok(Some(cache_path)) = migrate_external_catalog_to_cache_if_needed(&app, source) {
      source.url = cache_path;
    }
    if source.download_count <= 0 {
      if let Ok(conn) = open_database_connection(&app) {
        let local_count = count_hydra_catalog_entries(&conn, &source.id) as i64;
        if local_count > 0 {
          source.download_count = local_count;
        }
      }
    }
    if let Some(cached) = load_cached_catalog_for_source(&app, source) {
      let url_hint = source
        .remote_url
        .as_deref()
        .unwrap_or(source.url.as_str());
      let better = resolve_source_display_name(cached.name.as_deref(), None, url_hint);
      if !better.is_empty() && better != source.name {
        // Não sobrescrever nome já vindo da API nesta passagem.
        if source.api_source_id.is_none() {
          source.name = better.clone();
          if let Ok(conn) = open_database_connection(&app) {
            let _ = persist_hydra_source_display_name(&conn, &source.id, &better);
          }
        }
      }
    }
  }

  Ok(sources)
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

fn persist_source_download_count_from_api_priority(
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
  // Prioridade: contagem da API; local só se a API não tiver valor.
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
      Ok((outcome @ SyncCatalogOutcome::Unchanged(count), api)) => {
        let api_count = api.as_ref().map(|meta| meta.download_count);
        if let Some(meta) = &api {
          if let Ok(conn) = open_database_connection(&app) {
            let _ = persist_hydra_api_meta(&conn, &source.id, meta);
          }
        }
        persist_source_download_count_from_api_priority(&app, &source.id, api_count, count);
        unchanged_count += 1;
        let mut dto = sync_outcome_to_dto(&source.id, outcome);
        if let Some(api) = api_count.filter(|value| *value > 0) {
          dto.download_count = api.max(0) as usize;
        }
        synced.push(dto);
      }
      Ok((outcome @ SyncCatalogOutcome::Updated(count), api)) => {
        let api_count = api.as_ref().map(|meta| meta.download_count);
        if let Some(meta) = &api {
          if let Ok(conn) = open_database_connection(&app) {
            let _ = persist_hydra_api_meta(&conn, &source.id, meta);
          }
        }
        persist_source_download_count_from_api_priority(&app, &source.id, api_count, count);
        let mut dto = sync_outcome_to_dto(&source.id, outcome);
        if let Some(api) = api_count.filter(|value| *value > 0) {
          dto.download_count = api.max(0) as usize;
        }
        synced.push(dto);
      }
      Ok((outcome @ SyncCatalogOutcome::OfflineOnly { count, .. }, api)) => {
        let api_count = api.as_ref().map(|meta| meta.download_count);
        if let Some(meta) = &api {
          if let Ok(conn) = open_database_connection(&app) {
            let _ = persist_hydra_api_meta(&conn, &source.id, meta);
          }
        }
        persist_source_download_count_from_api_priority(&app, &source.id, api_count, count);
        let mut dto = sync_outcome_to_dto(&source.id, outcome);
        if let Some(api) = api_count.filter(|value| *value > 0) {
          dto.download_count = api.max(0) as usize;
        }
        synced.push(dto);
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

#[tauri::command]
pub fn open_catalogs_cache_folder(app: AppHandle) -> Result<String, String> {
  let dir = catalog_cache_dir(&app)?;
  std::fs::create_dir_all(&dir)
    .map_err(|error| format!("could_not_create_catalogs_folder: {error}"))?;
  open_path_in_shell(&dir)?;
  Ok(dir.to_string_lossy().into_owned())
}
