use super::fetch::fetch_catalog_body_for_source;
use super::names::display_name_for_source_url;
use super::url_detect::normalize_remote_catalog_url;
use super::paths_local::resolve_local_catalog_path_for_write;
use super::sync_apply::apply_downloaded_catalog_body;
use super::types::SyncCatalogOutcome;
use crate::dto::HydraSourceDto;
use tauri::AppHandle;

pub async fn import_source_catalog_from_remote_url(
  app: &AppHandle,
  source_id: &str,
  remote_url: &str,
  cache_path: &str,
) -> Result<(usize, Option<crate::sources::hydra::HydraApiDownloadSource>), String> {
  let normalized_remote = normalize_remote_catalog_url(remote_url)?;
  let path = resolve_local_catalog_path_for_write(cache_path)?;

  let temp_source = HydraSourceDto {
    id: source_id.to_string(),
    name: display_name_for_source_url(&normalized_remote),
    url: cache_path.trim().to_string(),
    status: "MATCHED".to_string(),
    download_count: 0,
    fingerprint: None,
    api_source_id: None,
    remote_url: Some(normalized_remote.clone()),
    created_at: String::new(),
  };

  let json_result = fetch_catalog_body_for_source(&temp_source).await;
  let api_meta = crate::sources::hydra::hydra_refresh_download_source_meta(&normalized_remote, None, None)
    .await
    .ok();

  if let Ok((body, _label)) = json_result {
    let outcome = apply_downloaded_catalog_body(
      app,
      source_id,
      cache_path,
      &path,
      &body,
      api_meta.clone(),
    )?;
    let count = match outcome.0 {
      SyncCatalogOutcome::Updated(count) | SyncCatalogOutcome::Unchanged(count) => count,
      SyncCatalogOutcome::OfflineOnly { count, .. } => count,
    };
    return Ok((count, outcome.1.or(api_meta)));
  }

  if let Some(meta) = api_meta {
    let count = meta.download_count.max(0) as usize;
    return Ok((count, Some(meta)));
  }

  let download_error = json_result.err().unwrap_or_default();
  Err(format!(
    "{download_error} Configure HYDRALINKS_MIRROR_URL no .env, importe o .json manualmente, \
ou tente novamente quando a API Hydra estiver disponível."
  ))
}
