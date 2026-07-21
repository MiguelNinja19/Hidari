use super::CoverPrecacheState;
use crate::db::open_database_connection;
use crate::dto::CoverPrecacheStatusDto;
use std::sync::atomic::Ordering;
use tauri::AppHandle;

#[tauri::command]
pub fn retry_unresolved_covers(
  app: AppHandle,
  state: tauri::State<'_, CoverPrecacheState>,
) -> Result<CoverPrecacheStatusDto, String> {
  let conn = open_database_connection(&app)?;
  super::super::clear_cover_precache_skips(&conn)?;
  drop(conn);
  super::maybe_start_cover_precache(&app);
  Ok(state.status())
}

#[tauri::command]
pub fn get_cover_precache_status(
  state: tauri::State<'_, CoverPrecacheState>,
) -> CoverPrecacheStatusDto {
  state.status()
}

#[tauri::command]
pub fn start_cover_precache(
  app: AppHandle,
  state: tauri::State<'_, CoverPrecacheState>,
) -> CoverPrecacheStatusDto {
  if !state.worker_running.load(Ordering::Acquire) {
    super::spawn_cover_precache(app, state.inner().clone());
  }
  state.status()
}

#[tauri::command]
pub fn stop_cover_precache(
  state: tauri::State<'_, CoverPrecacheState>,
) -> CoverPrecacheStatusDto {
  state.cancel.store(true, Ordering::Release);
  state.status()
}

#[tauri::command]
pub fn get_cover_cache_stats(app: AppHandle) -> Result<CoverPrecacheStatusDto, String> {
  let conn = open_database_connection(&app)?;
  let dir = super::super::covers_dir_for_app(&app)?;
  let total = super::count_catalog_titles(&conn)?;
  let cached = super::count_cached_covers(&conn, &dir)?;
  Ok(CoverPrecacheStatusDto {
    running: false,
    total,
    processed: cached,
    cached,
    downloaded: 0,
    unresolved: super::super::count_active_cover_skips(&conn).unwrap_or(0),
    failed: 0,
  })
}
