use crate::db::open_database_connection;
use crate::dto::{AddExternalLibraryGamePayload, LocalLibraryItemDto};
use crate::launch;
use crate::library::roots::{remember_library_game_root, upsert_library_launch_exe};
use crate::path_security::{validate_absolute_user_path, validate_existing_directory};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddExternalLibraryGameResult {
  pub title: String,
  pub path: String,
}

fn display_title(path: &Path, override_title: Option<&str>) -> String {
  override_title
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(str::to_string)
    .unwrap_or_else(|| {
      path
        .file_stem()
        .or_else(|| path.file_name())
        .and_then(|name| name.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Game")
        .to_string()
    })
}

fn folder_looks_playable(title: &str, folder: &Path) -> bool {
  launch::folder_has_playable_game(title, folder) || launch::folder_has_playable_game("", folder)
}

fn extension_eq(path: &Path, expected: &str) -> bool {
  path
    .extension()
    .and_then(|value| value.to_str())
    .is_some_and(|ext| ext.eq_ignore_ascii_case(expected))
}

fn modified_at(path: &Path) -> u64 {
  std::fs::metadata(path)
    .ok()
    .and_then(|meta| meta.modified().ok())
    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
    .map(|duration| duration.as_secs())
    .unwrap_or(0)
}

fn add_folder(
  app: &AppHandle,
  folder: PathBuf,
  title_override: Option<&str>,
) -> Result<AddExternalLibraryGameResult, String> {
  let title = display_title(&folder, title_override);
  if !folder_looks_playable(&title, &folder) {
    #[cfg(target_os = "macos")]
    let message =
      "Não encontramos um jogo nativo (.app) nessa pasta. Escolha a pasta onde o jogo está instalado.";
    #[cfg(not(target_os = "macos"))]
    let message = "Não encontramos um executável jogável nessa pasta. Escolha a pasta, o .exe ou um atalho .url.";
    return Err(message.to_string());
  }
  let dest_path = folder.to_string_lossy().to_string();
  let conn = open_database_connection(app)?;
  remember_library_game_root(&conn, &dest_path, &title, &folder)?;
  Ok(AddExternalLibraryGameResult {
    title,
    path: dest_path,
  })
}

fn add_exe(
  app: &AppHandle,
  exe: PathBuf,
  title_override: Option<&str>,
) -> Result<AddExternalLibraryGameResult, String> {
  let folder = exe
    .parent()
    .filter(|parent| parent.is_dir())
    .ok_or_else(|| "O .exe precisa estar numa pasta válida.".to_string())?
    .to_path_buf();
  let title = display_title(&exe, title_override);
  let dest_path = folder.to_string_lossy().to_string();
  let conn = open_database_connection(app)?;
  remember_library_game_root(&conn, &dest_path, &title, &folder)?;
  upsert_library_launch_exe(&conn, &dest_path, &title, &exe)?;
  Ok(AddExternalLibraryGameResult {
    title,
    path: dest_path,
  })
}

fn add_url_shortcut(
  app: &AppHandle,
  url_file: PathBuf,
  title_override: Option<&str>,
) -> Result<AddExternalLibraryGameResult, String> {
  if !url_file.is_file() {
    return Err("O atalho .url não existe.".to_string());
  }
  let title = display_title(&url_file, title_override);
  // game_root = o próprio ficheiro → só este path fica managed (não o Desktop inteiro).
  let dest_path = url_file.to_string_lossy().to_string();
  let conn = open_database_connection(app)?;
  remember_library_game_root(&conn, &dest_path, &title, &url_file)?;
  upsert_library_launch_exe(&conn, &dest_path, &title, &url_file)?;
  Ok(AddExternalLibraryGameResult {
    title,
    path: dest_path,
  })
}

/// Importa pasta, .exe ou atalho `.url` (ex.: Don't Starve Together.url).
#[tauri::command]
pub fn add_external_library_game(
  app: AppHandle,
  payload: AddExternalLibraryGamePayload,
) -> Result<AddExternalLibraryGameResult, String> {
  let path = validate_absolute_user_path(&payload.path)
    .map_err(|_| "Caminho inválido.".to_string())?;
  let title = payload.title.as_deref();

  if path.is_dir() {
    let folder = validate_existing_directory(&payload.path)
      .map_err(|_| "A pasta escolhida não existe.".to_string())?;
    return add_folder(&app, folder, title);
  }

  if path.is_file() {
    if extension_eq(&path, "exe") {
      return add_exe(&app, path, title);
    }
    if extension_eq(&path, "url") || extension_eq(&path, "lnk") {
      return add_url_shortcut(&app, path, title);
    }
  }

  Err("Escolha uma pasta do jogo, um ficheiro .exe ou um atalho .url.".to_string())
}

fn paths_equal_ci(a: &Path, b: &Path) -> bool {
  normalize_path_key_fs(&a.to_string_lossy()) == normalize_path_key_fs(&b.to_string_lossy())
}

fn normalize_path_key_fs(path: &str) -> String {
  path.trim().replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

fn path_under_root(path: &Path, root: &Path) -> bool {
  let path_s = normalize_path_key_fs(&path.to_string_lossy());
  let root_s = normalize_path_key_fs(&root.to_string_lossy());
  if path_s.is_empty() || root_s.is_empty() {
    return false;
  }
  path_s == root_s || path_s.starts_with(&(root_s.clone() + "\\"))
}

/// Só imports do utilizador (atalho/pasta via «Adicionar jogo»), não roots FitGirl/locate.
fn is_user_imported_external(dest: &Path, root: &Path, download_root: Option<&Path>) -> bool {
  if dest.is_file()
    && (extension_eq(dest, "url") || extension_eq(dest, "lnk") || extension_eq(dest, "exe"))
  {
    return true;
  }
  // add_external grava dest_path == game_root
  if !paths_equal_ci(dest, root) {
    return false;
  }
  if let Some(download) = download_root {
    if path_under_root(dest, download) {
      return false;
    }
  }
  dest.is_dir() || root.is_dir()
}

pub(crate) fn list_external_library_items(app: &AppHandle) -> Vec<LocalLibraryItemDto> {
  let Ok(conn) = open_database_connection(app) else {
    return Vec::new();
  };
  let Ok(mut stmt) = conn.prepare(
    "SELECT title, dest_path, game_root FROM library_game_roots ORDER BY updated_at DESC",
  ) else {
    return Vec::new();
  };
  let rows = stmt
    .query_map([], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
      ))
    })
    .ok()
    .into_iter()
    .flatten()
    .filter_map(Result::ok);

  let download_root = crate::db::get_default_download_path(app)
    .ok()
    .flatten()
    .filter(|value| !value.trim().is_empty())
    .map(PathBuf::from);

  let mut items = Vec::new();
  for (title, dest_path, game_root) in rows {
    let dest = PathBuf::from(dest_path.trim());
    let root = PathBuf::from(game_root.trim());
    if !is_user_imported_external(&dest, &root, download_root.as_deref()) {
      continue;
    }

    let display = if dest.exists() {
      dest
    } else if root.exists() {
      root
    } else {
      continue;
    };

    let is_dir = display.is_dir();
    if !is_dir
      && !extension_eq(&display, "url")
      && !extension_eq(&display, "lnk")
      && !extension_eq(&display, "exe")
    {
      continue;
    }

    let name = if !title.trim().is_empty() {
      title
    } else {
      display
        .file_stem()
        .or_else(|| display.file_name())
        .and_then(|value| value.to_str())
        .unwrap_or("Game")
        .to_string()
    };

    items.push(LocalLibraryItemDto {
      name,
      path: display.to_string_lossy().to_string(),
      is_dir,
      size_bytes: if is_dir {
        0
      } else {
        std::fs::metadata(&display).map(|meta| meta.len()).unwrap_or(0)
      },
      modified_at: modified_at(&display),
      external: true,
    });
  }
  items
}

fn read_internet_shortcut_url(path: &Path) -> Option<String> {
  let text = std::fs::read_to_string(path).ok()?;
  for line in text.lines() {
    let trimmed = line.trim();
    if let Some(rest) = trimmed
      .strip_prefix("URL=")
      .or_else(|| trimmed.strip_prefix("url="))
    {
      let url = rest.trim();
      if !url.is_empty() {
        return Some(url.to_string());
      }
    }
  }
  None
}

fn origin_launcher_url_from_shortcut(target: &str) -> String {
  let lower = target.to_ascii_lowercase();
  if lower.starts_with("steam:") {
    return "steam://open/games".to_string();
  }
  if lower.starts_with("com.epicgames.launcher:")
    || lower.contains("epicgames.com")
    || lower.contains("epicgameslauncher")
  {
    return "com.epicgames.launcher://".to_string();
  }
  if lower.starts_with("origin2://") || lower.starts_with("origin://") {
    return "origin2://library/open".to_string();
  }
  if lower.starts_with("battlenet://") {
    return "battlenet://".to_string();
  }
  if lower.starts_with("xboxgames:") || lower.starts_with("ms-xbl-") {
    return target.to_string();
  }
  // Protocolo genérico: tenta abrir o alvo do atalho.
  target.to_string()
}

/// Abre o launcher de origem (Steam/Epic/…) ou a pasta do jogo — para gerir/desinstalar lá.
#[tauri::command]
pub fn open_library_origin_launcher(
  app: AppHandle,
  path: String,
) -> Result<(), String> {
  let path = path.trim();
  if path.is_empty() {
    return Err("missing_path".to_string());
  }
  let _ = crate::path_security::validate_managed_path(&app, path)?;
  let target = PathBuf::from(path);

  if extension_eq(&target, "url") {
    let url = read_internet_shortcut_url(&target)
      .ok_or_else(|| "could_not_read_shortcut_url".to_string())?;
    let launch = origin_launcher_url_from_shortcut(&url);
    return crate::launch::open_shell_target(&launch)
      .map_err(|error| error.replace("could_not_open_target", "could_not_open_origin_launcher"));
  }

  if extension_eq(&target, "lnk") {
    return crate::launch::open_shell_target(&target.to_string_lossy())
      .map_err(|error| error.replace("could_not_open_target", "could_not_open_origin_launcher"));
  }

  let folder = if target.is_file() {
    target
      .parent()
      .map(Path::to_path_buf)
      .ok_or_else(|| "missing_parent_folder".to_string())?
  } else {
    target
  };
  crate::launch::open_shell_target(&folder.to_string_lossy())
    .map_err(|error| error.replace("could_not_open_target", "could_not_open_origin_launcher"))
}
