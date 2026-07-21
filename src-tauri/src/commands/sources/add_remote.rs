use crate::commands::sources::add::{resolve_covers_after_import, rollback_failed_source};
use crate::db::open_database_connection;
use crate::dto::HydraSourceDto;
use crate::sources::{
  catalog_cache_path_for_remote_url, get_hydra_source_by_id,
  import_source_catalog_from_remote_url, load_cached_catalog_for_source, normalize_remote_catalog_url,
  persist_hydra_api_meta, upsert_hydra_source,
};
use rusqlite::params;
use tauri::AppHandle;

pub async fn import(app: AppHandle, input: &str) -> Result<HydraSourceDto, String> {
  let remote_url = normalize_remote_catalog_url(input)?;
  let cache_path = catalog_cache_path_for_remote_url(&app, &remote_url)?;
  let cache_path_str = cache_path.to_string_lossy().into_owned();
  let source = crate::sources::create_hydra_source_from_remote(&remote_url, &cache_path_str);

  let conn = open_database_connection(&app)?;
  upsert_hydra_source(&conn, &source)?;
  drop(conn);

  let (download_count, api_meta) =
    match import_source_catalog_from_remote_url(&app, &source.id, &remote_url, &cache_path_str).await
    {
      Ok(result) => result,
      Err(error) => {
        rollback_failed_source(&app, &source.id);
        return Err(error);
      }
    };

  if let Some(ref api) = api_meta {
    if let Ok(conn) = open_database_connection(&app) {
      let _ = persist_hydra_api_meta(&conn, &source.id, api);
    }
  }

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
  resolve_covers_after_import(&app);
  let _ = load_cached_catalog_for_source(&app, &source);
  Ok(source)
}
