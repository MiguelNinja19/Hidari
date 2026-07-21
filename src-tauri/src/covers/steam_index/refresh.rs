use crate::db::open_database_connection;
use crate::dto::SteamAppIndexStatusDto;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;

static REFRESH_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

pub async fn fetch_and_store_steam_app_list(app: &AppHandle) -> Result<usize, String> {
  let apps = super::fetch_steam_app_list().await?;
  let count = apps.len();
  let mut conn = open_database_connection(app)?;
  super::store_steam_app_index(&mut conn, &apps)?;
  super::set_updated_at(&conn, super::super::precache::now_unix_secs());
  Ok(count)
}

async fn run_refresh(app: &AppHandle) {
  if REFRESH_IN_PROGRESS
    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
    .is_err()
  {
    return;
  }
  match fetch_and_store_steam_app_list(app).await {
    Ok(_) => {
      let _ = super::super::precache::bulk_resolve_catalog_covers_from_index(app);
    }
    Err(error) => eprintln!("steam_app_index_refresh_failed: {error}"),
  }
  REFRESH_IN_PROGRESS.store(false, Ordering::Release);
}

pub fn maybe_refresh_steam_app_index(app: &AppHandle) {
  let app = app.clone();
  tauri::async_runtime::spawn(async move {
    let stale = open_database_connection(&app)
      .map(|conn| super::steam_app_index_is_stale(&conn))
      .unwrap_or(true);
    if stale {
      run_refresh(&app).await;
    }
  });
}

#[tauri::command]
pub async fn refresh_steam_app_index(
  app: AppHandle,
) -> Result<SteamAppIndexStatusDto, String> {
  run_refresh(&app).await;
  get_steam_app_index_status(app)
}

#[tauri::command]
pub fn get_steam_app_index_status(
  app: AppHandle,
) -> Result<SteamAppIndexStatusDto, String> {
  let conn = open_database_connection(&app)?;
  Ok(SteamAppIndexStatusDto {
    total_apps: super::steam_app_index_count(&conn),
    last_updated_at: super::steam_app_index_last_updated(&conn),
    refreshing: REFRESH_IN_PROGRESS.load(Ordering::Acquire),
  })
}
