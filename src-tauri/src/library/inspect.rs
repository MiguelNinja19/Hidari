use crate::archive;
use crate::db::{get_default_download_path, open_database_connection};
use crate::dto::{LaunchGamePayload, LibraryPathStateDto};
use crate::launch::{self, SCAN_DEPTH_FAST};
use crate::library::roots::{
  clear_library_launch_exe, launch_extra_roots, read_library_game_root, read_library_launch_exe,
  remember_library_game_root, upsert_library_launch_exe,
};
use crate::library::uninstall_helpers::find_install_root_from_exe;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

fn maybe_remember_install_root_from_exe(
  app: &AppHandle,
  conn: &rusqlite::Connection,
  dest_path: &str,
  title: &str,
  exe: &Path,
) {
  let Some(root) = find_install_root_from_exe(exe) else {
    return;
  };
  let download_root = get_default_download_path(app)
    .ok()
    .flatten()
    .map(PathBuf::from);
  let outside = match (
    download_root
      .as_ref()
      .and_then(|base| std::fs::canonicalize(base).ok()),
    std::fs::canonicalize(&root).ok(),
  ) {
    (Some(base), Some(target)) => !target.starts_with(&base),
    (Some(base), None) => !root.starts_with(base),
    _ => true,
  };
  if outside {
    let _ = remember_library_game_root(conn, dest_path, title, &root);
  }
}

fn is_shortcut_file(path: &Path) -> bool {
  path.is_file()
    && path
      .extension()
      .and_then(|value| value.to_str())
      .is_some_and(|ext| ext.eq_ignore_ascii_case("url") || ext.eq_ignore_ascii_case("lnk"))
}

fn playable_shortcut_state(
  custom_game_root: Option<String>,
  launch: PathBuf,
) -> LibraryPathStateDto {
  LibraryPathStateDto {
    has_game: true,
    needs_install: false,
    install_path: None,
    needs_extraction: false,
    playable: true,
    custom_game_root,
    launch_path: Some(launch.to_string_lossy().to_string()),
  }
}

fn playable_cached_exe_state(
  custom_game_root: Option<String>,
  exe: PathBuf,
) -> LibraryPathStateDto {
  LibraryPathStateDto {
    has_game: true,
    needs_install: false,
    install_path: None,
    needs_extraction: false,
    playable: true,
    custom_game_root,
    launch_path: Some(exe.to_string_lossy().to_string()),
  }
}

/// Inspect barato para refresh da UI (depth FAST). Play usa resolução FULL.
pub fn inspect_library_path_internal(
  app: &AppHandle,
  title: &str,
  path: &str,
  job_id: Option<&str>,
) -> LibraryPathStateDto {
  let path_buf = PathBuf::from(path.trim());
  let conn = open_database_connection(app).ok();
  let custom_game_root = conn
    .as_ref()
    .and_then(|c| read_library_game_root(c, path, title))
    .map(|root| root.to_string_lossy().to_string());

  // Atalho .url/.lnk como dest_path: NÃO usar o parent (ex.: Desktop) como root a varrer.
  if is_shortcut_file(&path_buf) {
    return playable_shortcut_state(custom_game_root, path_buf);
  }

  if let Some(ref c) = conn {
    if let Some(exe) = read_library_launch_exe(c, path, title) {
      if is_shortcut_file(&exe) {
        return playable_shortcut_state(custom_game_root, exe);
      }
      // .exe já conhecido → evita varrer pastas enormes em cada refresh da biblioteca.
      if exe.is_file() {
        return playable_cached_exe_state(custom_game_root, exe);
      }
    }
    if let Some(root) = read_library_game_root(c, path, title) {
      if is_shortcut_file(&root) {
        return playable_shortcut_state(custom_game_root, root);
      }
    }
  }

  let roots = launch_extra_roots(app, title, path, job_id);
  let content_path = launch::resolve_game_content_root(title, path)
    .to_string_lossy()
    .to_string();

  // Refresh da library: depth FAST. FULL fica para o Play.
  let candidates = launch::resolve_launch_candidates_with_extra_roots_depth(
    title,
    path,
    &roots,
    SCAN_DEPTH_FAST,
  );

  #[cfg(not(target_os = "macos"))]
  let install_path = launch::find_setup_executable_shallow(title, path, &roots)
    .map(|path| path.to_string_lossy().to_string());
  #[cfg(target_os = "macos")]
  let install_path = None::<String>;

  let mut has_game = candidates.is_ok();
  if !has_game {
    if let Some(root) = &custom_game_root {
      let root_path = Path::new(root);
      if root_path.is_dir()
        && launch::folder_has_playable_game_exe_depth(title, root_path, SCAN_DEPTH_FAST)
      {
        has_game = true;
      }
    }
  }

  let mut launch_path: Option<PathBuf> = candidates
    .as_ref()
    .ok()
    .and_then(|items| items.first().cloned());
  if launch_path.is_none() {
    if let Some(ref c) = conn {
      launch_path = read_library_launch_exe(c, path, title);
    }
  }
  if launch_path.is_none() {
    if let Some(root) = &custom_game_root {
      let root_path = Path::new(root);
      if root_path.is_dir() {
        launch_path = launch::resolve_launch_candidates_with_extra_roots_depth(
          title,
          root,
          &[],
          SCAN_DEPTH_FAST,
        )
        .ok()
        .and_then(|items| items.into_iter().next());
      }
    }
  }

  if has_game {
    if let Some(ref exe) = launch_path {
      if !is_shortcut_file(exe) {
        if let Some(ref c) = conn {
          let _ = upsert_library_launch_exe(c, path, title, exe);
          maybe_remember_install_root_from_exe(app, c, path, title, exe);
        }
      }
    }
  }

  let needs_install = !has_game && install_path.is_some();
  if needs_install {
    if let Some(ref c) = conn {
      let _ = clear_library_launch_exe(c, path, title);
    }
    launch_path = None;
  }

  let needs_extraction = !has_game
    && install_path.is_none()
    && (archive::find_job_archive(&content_path).is_some()
      || archive::find_job_archive(path).is_some());

  LibraryPathStateDto {
    has_game,
    needs_install,
    install_path,
    needs_extraction,
    playable: has_game,
    custom_game_root,
    launch_path: launch_path.map(|p| p.to_string_lossy().to_string()),
  }
}

#[tauri::command]
pub async fn inspect_library_path(
  app: AppHandle,
  payload: LaunchGamePayload,
) -> LibraryPathStateDto {
  tauri::async_runtime::spawn_blocking(move || {
    inspect_library_path_internal(
      &app,
      &payload.title,
      &payload.path,
      payload.job_id.as_deref(),
    )
  })
  .await
  .unwrap_or_else(|_| LibraryPathStateDto {
    has_game: false,
    needs_install: false,
    install_path: None,
    needs_extraction: false,
    playable: false,
    custom_game_root: None,
    launch_path: None,
  })
}
