use crate::db::{self, open_database_connection};
use crate::dto::LaunchGamePayload;
use crate::sidecar::{emit_extract_status, process_job_extraction, process_job_post_download};
use crate::state::ExtractionState;
use crate::{archive, launch};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use tauri::{AppHandle, Manager};

pub fn folder_extraction_job_id(path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    path.to_lowercase().hash(&mut hasher);
    format!("folder:{:x}", hasher.finish())
}

#[tauri::command]
pub async fn extract_library_folder(
    app: AppHandle,
    payload: LaunchGamePayload,
) -> Result<(), String> {
    let extraction = app.state::<ExtractionState>();
    if !extraction.try_acquire() {
        return Err("extraction_busy".to_string());
    }
    let _ = crate::path_security::validate_managed_path(&app, &payload.path)?;
    let content_path = launch::resolve_game_content_root(&payload.title, &payload.path);
    let content_path = content_path.to_string_lossy().to_string();
    let job_id = payload
        .job_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| folder_extraction_job_id(&payload.path));
    let app_clone = app.clone();
    let result = if archive::find_job_archive(&content_path).is_some() {
        process_job_extraction(
            app_clone.clone(),
            job_id.clone(),
            payload.title,
            content_path,
        )
        .await
    } else {
        process_job_post_download(
            app_clone.clone(),
            job_id.clone(),
            payload.title,
            content_path,
        )
        .await
    };
    extraction.release();
    if let Err(error) = &result {
        if let Ok(conn) = open_database_connection(&app_clone) {
            let _ = db::upsert_extraction_log(
                &conn,
                &job_id,
                "failed",
                None,
                None,
                Some(error.as_str()),
            );
        }
        emit_extract_status(&app_clone, &job_id, "failed", Some(error.clone()));
    }
    result
}
