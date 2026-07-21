use crate::db::open_database_connection;
use crate::dto::HydraSourceDto;
use crate::sources::{
  count_hydra_catalog_entries, hydra_refresh_download_source_meta, list_hydra_sources,
  load_cached_catalog_for_source, migrate_external_catalog_to_cache_if_needed,
  persist_hydra_api_meta, persist_hydra_source_display_name, resolve_source_display_name,
};
use tauri::AppHandle;

#[tauri::command]
pub async fn get_download_sources(app: AppHandle) -> Result<Vec<HydraSourceDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut sources = list_hydra_sources(&conn)?;
  drop(conn);

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
      if !better.is_empty() && better != source.name && source.api_source_id.is_none() {
        source.name = better.clone();
        if let Ok(conn) = open_database_connection(&app) {
          let _ = persist_hydra_source_display_name(&conn, &source.id, &better);
        }
      }
    }
  }

  Ok(sources)
}
