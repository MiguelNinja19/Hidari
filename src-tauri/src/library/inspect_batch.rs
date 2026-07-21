use crate::dto::{InspectLibraryPathResultItem, InspectLibraryPathsPayload};
use crate::library::inspect::inspect_library_path_internal;
use tauri::AppHandle;

#[tauri::command]
pub async fn inspect_library_paths(
    app: AppHandle,
    payload: InspectLibraryPathsPayload,
) -> Result<Vec<InspectLibraryPathResultItem>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        payload
            .entries
            .into_iter()
            .map(|entry| InspectLibraryPathResultItem {
                key: entry.key,
                state: inspect_library_path_internal(
                    &app,
                    &entry.title,
                    &entry.path,
                    entry.job_id.as_deref(),
                ),
            })
            .collect()
    })
    .await
    .map_err(|error| format!("inspect_library_paths_failed: {error}"))
}
