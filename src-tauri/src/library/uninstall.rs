use super::delete::purge_library_item_db;
use super::install_locations::collect_library_installed_locations;
use super::uninstall_helpers::uninstall_install_folder;
use crate::db::open_database_connection;
use crate::dto::LaunchGamePayload;
use tauri::AppHandle;

#[tauri::command]
pub async fn get_library_installed_locations(
    app: AppHandle,
    payload: LaunchGamePayload,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(collect_library_installed_locations(&app, &payload.title, &payload.path)
            .into_iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect())
    })
    .await
    .map_err(|error| format!("installed_locations_task_failed: {error}"))?
}

#[tauri::command]
pub async fn uninstall_library_item(app: AppHandle, payload: LaunchGamePayload) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let locations = collect_library_installed_locations(&app, &payload.title, &payload.path);
        let errors: Vec<_> = locations
            .iter()
            .filter_map(|folder| {
                uninstall_install_folder(folder)
                    .err()
                    .map(|error| format!("{}: {error}", folder.to_string_lossy()))
            })
            .collect();
        if let Ok(conn) = open_database_connection(&app) {
            purge_library_item_db(&conn, payload.path.trim(), payload.title.trim());
        }
        if errors.is_empty() {
            Ok(())
        } else {
            Err(format!("uninstall_partial_failure: {}", errors.join(" | ")))
        }
    })
    .await
    .map_err(|error| format!("uninstall_task_failed: {error}"))?
}

#[cfg(test)]
#[path = "uninstall_tests.rs"]
mod tests;
