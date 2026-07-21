use super::inspect::inspect_library_path_internal;
use crate::db::open_database_connection;
use crate::dto::{LibraryPathStateDto, SetLibraryGameRootPayload, SetLibraryLaunchExePayload};
use crate::launch;
use crate::library::roots::{upsert_library_game_root, upsert_library_launch_exe};
use tauri::AppHandle;

#[tauri::command]
pub fn set_library_game_root(
    app: AppHandle,
    payload: SetLibraryGameRootPayload,
) -> Result<LibraryPathStateDto, String> {
    let _ = crate::path_security::validate_managed_path(&app, &payload.dest_path)?;
    let game_root = crate::path_security::validate_existing_directory(&payload.game_root)
        .map_err(|_| "A pasta escolhida não existe.".to_string())?;
    if !launch::folder_has_playable_game(&payload.title, &game_root) {
        #[cfg(target_os = "macos")]
    let message =
      "Não encontramos um jogo nativo (.app) nessa pasta. Escolha a pasta onde foi instalado.";
        #[cfg(not(target_os = "macos"))]
    let message = "Não encontramos um executável jogável nessa pasta. Escolha a pasta onde o jogo foi instalado (com o .exe do jogo).";
        return Err(message.to_string());
    }
    let conn = open_database_connection(&app)?;
    upsert_library_game_root(&conn, &payload.dest_path, &payload.title, &game_root)?;
    Ok(inspect_library_path_internal(
        &app,
        &payload.title,
        &payload.dest_path,
        payload.job_id.as_deref(),
    ))
}

#[tauri::command]
pub fn set_library_launch_exe(
    app: AppHandle,
    payload: SetLibraryLaunchExePayload,
) -> Result<(), String> {
    let _ = crate::path_security::validate_managed_path(&app, &payload.dest_path)?;
    let exe = crate::path_security::validate_absolute_user_path(&payload.exe_path)?;
    let _ = crate::path_security::validate_managed_path(&app, &payload.exe_path)?;
    if !exe.is_file() {
        return Err("O ficheiro .exe escolhido não existe.".to_string());
    }
    let conn = open_database_connection(&app)?;
    upsert_library_launch_exe(&conn, &payload.dest_path, &payload.title, &exe)
}
