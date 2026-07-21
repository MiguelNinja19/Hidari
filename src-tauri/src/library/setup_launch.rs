use crate::db;
use crate::dto::LaunchGamePayload;
use crate::launch;
use crate::launch_errors;
use crate::sidecar::ensure_sidecar_running;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

fn pause_job(app: AppHandle, job_id: String) {
    tauri::async_runtime::spawn(async move {
        let Ok(client) = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(4))
            .build()
        else {
            return;
        };
        let Ok(port) = ensure_sidecar_running(app).await else {
            return;
        };
        let _ = client
            .post(format!("http://127.0.0.1:{port}/jobs/{job_id}/pause"))
            .send()
            .await;
    });
}

#[tauri::command]
pub async fn launch_setup_from_path(
    app: AppHandle,
    payload: LaunchGamePayload,
) -> Result<String, String> {
    let preferred = payload
        .preferred_setup
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if let Some(job_id) = payload.job_id.clone() {
        pause_job(app.clone(), job_id);
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _ = crate::path_security::validate_managed_path(&app, &payload.path)?;
        let roots = payload
            .job_id
            .as_deref()
            .map(|job_id| db::extraction_roots_for_job(&app, job_id))
            .unwrap_or_default();
        let setup = preferred
            .as_deref()
            .map(PathBuf::from)
            .filter(|path| launch::is_usable_setup_path(path))
            .or_else(|| {
                launch::find_setup_executable_with_extra_roots(
                    &payload.title,
                    &payload.path,
                    &roots,
                )
            })
            .ok_or_else(|| {
                "Nenhum instalador (setup.exe) encontrado na pasta do download.".to_string()
            })?;
        let install_dir = launch::resolve_game_content_root(&payload.title, &payload.path);
        if !setup.is_file() {
            return Err(
                "setup.exe ainda não está disponível na pasta. Aguarde o download terminar."
                    .to_string(),
            );
        }
        if !install_dir.exists() {
            return Err("Pasta do repack não encontrada. Aguarde o download terminar.".to_string());
        }
        let parent = setup
            .parent()
            .filter(|path| path.exists())
            .map(Path::to_path_buf)
            .unwrap_or(install_dir);
        launch::spawn_setup_executable_in(&setup, Some(&parent))
            .map_err(|error| launch_errors::map_launch_user_error(&error, &payload.path))?;
        Ok(setup.to_string_lossy().to_string())
    })
    .await
    .map_err(|error| format!("launch_setup_task_failed: {error}"))?
}
