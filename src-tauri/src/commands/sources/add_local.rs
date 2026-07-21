use crate::commands::sources::add::{resolve_covers_after_import, rollback_failed_source};
use crate::db::open_database_connection;
use crate::dto::HydraSourceDto;
use crate::sources::{
  create_hydra_source, finalize_local_catalog_import, get_hydra_source_by_id,
  hydralinks_remote_url_for_local_path, load_cached_catalog_for_source, stage_local_catalog_for_import,
  upsert_hydra_source,
};
use rusqlite::params;
use tauri::AppHandle;

pub async fn import(app: AppHandle, input: &str) -> Result<HydraSourceDto, String> {
  let remote_url = hydralinks_remote_url_for_local_path(input);
  let staged = stage_local_catalog_for_import(&app, input)?;
  let source = create_hydra_source(&staged.cache_path, remote_url.as_deref());
  let conn = open_database_connection(&app)?;
  upsert_hydra_source(&conn, &source)?;
  drop(conn);

  if let Err(error) = finalize_local_catalog_import(&app, &source.id, &staged) {
    rollback_failed_source(&app, &source.id);
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
  resolve_covers_after_import(&app);
  let _ = load_cached_catalog_for_source(&app, &source);
  Ok(source)
}
