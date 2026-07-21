use crate::db::get_default_download_path;
use crate::dto::LocalLibraryItemDto;
use crate::library::import::list_external_library_items;
use std::collections::HashSet;
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

fn normalize_path_key(path: &str) -> String {
  path.trim().replace('/', "\\").to_lowercase()
}

fn scan_blocking(app: AppHandle) -> Result<Vec<LocalLibraryItemDto>, String> {
  let mut items = Vec::new();
  let mut seen = HashSet::new();

  if let Some(path) = get_default_download_path(&app)?.filter(|path| !path.trim().is_empty()) {
    if let Ok(entries) = fs::read_dir(&path) {
      for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else {
          continue;
        };
        // Só pastas na raiz de downloads — ficheiros .exe/.url soltos não são jogos.
        if !metadata.is_dir() {
          continue;
        }
        let modified_at = metadata
          .modified()
          .ok()
          .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
          .map(|duration| duration.as_secs())
          .unwrap_or(0);
        let item_path = entry.path().to_string_lossy().to_string();
        seen.insert(normalize_path_key(&item_path));
        items.push(LocalLibraryItemDto {
          name: entry.file_name().to_string_lossy().to_string(),
          path: item_path,
          is_dir: true,
          size_bytes: 0,
          modified_at,
          external: false,
        });
      }
    }
  }

  for external in list_external_library_items(&app) {
    let key = normalize_path_key(&external.path);
    if seen.insert(key) {
      items.push(external);
    }
  }

  items.sort_by_key(|item| std::cmp::Reverse(item.modified_at));
  Ok(items)
}
