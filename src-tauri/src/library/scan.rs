use crate::db::get_default_download_path;
use crate::dto::LocalLibraryItemDto;
use std::fs;
use std::time::UNIX_EPOCH;
use tauri::AppHandle;

#[tauri::command]
pub async fn scan_default_download_path(
    app: AppHandle,
) -> Result<Vec<LocalLibraryItemDto>, String> {
    tauri::async_runtime::spawn_blocking(move || scan_blocking(app))
        .await
        .map_err(|error| format!("scan_join_error: {error}"))?
}

fn scan_blocking(app: AppHandle) -> Result<Vec<LocalLibraryItemDto>, String> {
    let Some(path) = get_default_download_path(&app)?.filter(|path| !path.trim().is_empty()) else {
        return Ok(Vec::new());
    };
    let entries =
        fs::read_dir(&path).map_err(|error| format!("could_not_read_default_path: {error}"))?;
    let mut items = Vec::new();
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or(0);
        items.push(LocalLibraryItemDto {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size_bytes: if metadata.is_file() {
                metadata.len()
            } else {
                0
            },
            modified_at,
        });
    }
    items.sort_by_key(|item| std::cmp::Reverse(item.modified_at));
    Ok(items)
}
