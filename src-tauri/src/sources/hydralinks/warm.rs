use super::cache_load::load_cached_catalog_for_source;
use crate::db::open_database_connection;
use tauri::AppHandle;

pub fn warm_local_catalog_caches(app: &AppHandle) {
  let Ok(conn) = open_database_connection(app) else {
    return;
  };
  let Ok(sources) = crate::sources::hydra::list_hydra_sources(&conn) else {
    return;
  };
  let disabled = crate::db::get_disabled_hydra_source_ids_from_conn(&conn).unwrap_or_default();
  drop(conn);

  for source in sources {
    if disabled.contains(&source.id) {
      continue;
    }
    let _ = load_cached_catalog_for_source(app, &source);
  }
}
