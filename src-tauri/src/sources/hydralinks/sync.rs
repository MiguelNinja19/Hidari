use super::db_read::stored_payload_hash;
use super::fetch::fetch_catalog_body_for_source;
use super::paths::hydralinks_remote_url_for_local_path;
use super::source_resolve::resolve_remote_catalog_url;
use super::paths_local::resolve_local_catalog_path_for_write;
use super::presence::has_local_catalog;
use super::sync_apply::{apply_downloaded_catalog_body, download_catalog_fallback};
use super::types::SyncCatalogOutcome;
use super::util::payload_hash;
use crate::db::open_database_connection;
use crate::dto::HydraSourceDto;
use rusqlite::params;
use tauri::AppHandle;

pub async fn sync_source_catalog_from_remote(
  app: &AppHandle,
  source: &HydraSourceDto,
) -> Result<(SyncCatalogOutcome, Option<crate::sources::hydra::HydraApiDownloadSource>), String> {
  let source_id = source.id.as_str();
  let hydralinks_url = resolve_remote_catalog_url(source)
    .or_else(|| source.remote_url.clone())
    .or_else(|| hydralinks_remote_url_for_local_path(&source.url));

  let mut api_warning: Option<String> = None;
  let api_meta = if let Some(ref catalog_url) = hydralinks_url {
    match crate::sources::hydra::hydra_refresh_download_source_meta(
      catalog_url,
      source.api_source_id.as_deref(),
      source.fingerprint.as_deref(),
    ) .await {
      Ok(meta) => Some(meta),
      Err(error) => {
        api_warning = Some(error);
        None } }
  } else { None };

  if hydralinks_url.is_some() {
    if let Ok(local_path) = resolve_local_catalog_path_for_write(&source.url) {
      match fetch_catalog_body_for_source(source).await {
        Ok((body, _label)) => {
          if let (Some(meta), Ok(conn)) = (&api_meta, open_database_connection(app)) {
            let unchanged_fp = source
              .fingerprint
              .as_deref()
              .filter(|value| crate::sources::hydra::is_catalog_content_fingerprint(value))
              .is_some_and(|stored| meta.fingerprint.as_deref() == Some(stored));
            let unchanged_hash =
              stored_payload_hash(&conn, source_id).as_deref() == Some(payload_hash(&body).as_str());
            if unchanged_fp && unchanged_hash && has_local_catalog(app, source_id) {
              let local_count = conn
                .query_row(
                  "SELECT COUNT(*) FROM hydra_catalog_entries WHERE source_id = ?1",
                  params![source_id],
                  |row| row.get::<_, i64>(0),
                )
                .unwrap_or(0)
                .max(0) as usize;
              // Prioridade: contagem da API Hydra.
              let count = if meta.download_count > 0 {
                meta.download_count.max(0) as usize
              } else {
                local_count
              };
              return Ok((SyncCatalogOutcome::Unchanged(count), api_meta.clone()));
            } }
          return apply_downloaded_catalog_body(
            app,
            source_id,
            source.url.as_str(),
            &local_path,
            &body,
            api_meta,
          ); }
        Err(download_error) => {
          if has_local_catalog(app, source_id) {
            let detail = match api_warning {
              Some(api) => format!("API Hydra: {api} · Download: {download_error}"),
              None => download_error,
            };
            return download_catalog_fallback(app, source_id, Some(detail));
          } } } } }

  if let Some(meta) = api_meta {
    let count = meta.download_count.max(0) as usize;
    let unchanged = source
      .fingerprint
      .as_deref()
      .filter(|value| crate::sources::hydra::is_catalog_content_fingerprint(value))
      .is_some_and(|stored| meta.fingerprint.as_deref() == Some(stored));
    let outcome = if unchanged {
      SyncCatalogOutcome::Unchanged(count)
    } else {
      SyncCatalogOutcome::Updated(count)
    };
    return Ok((outcome, Some(meta)));
  }
  Err(api_warning.unwrap_or_else(|| {
    "Não foi possível atualizar: sem catálogo local e sem conexão com a API Hydra.".to_string()
  })) }
