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

fn is_shortcut_path(path: &Path) -> bool {
  extension_eq(path, "url") || extension_eq(path, "lnk") || extension_eq(path, "exe")
}

fn sanitize_shortcut_file_stem(title: &str) -> String {
  let cleaned: String = title
    .chars()
    .map(|c| {
      if c.is_ascii_alphanumeric() || c == ' ' || c == '-' || c == '_' {
        c
      } else {
        '_'
      }
    })
    .collect();
  let trimmed = cleaned.trim();
  if trimmed.is_empty() {
    "game".to_string()
  } else {
    trimmed.chars().take(80).collect()
  }
}

/// Copia o atalho para app_data para não depender do Desktop / pasta original.
fn persist_shortcut_copy(
  app: &AppHandle,
  source: &Path,
  title: &str,
) -> Result<PathBuf, String> {
  use tauri::Manager;

  let ext = source
    .extension()
    .and_then(|value| value.to_str())
    .unwrap_or("url");
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|error| format!("could_not_get_app_data_dir: {error}"))?
    .join("external_library");
  std::fs::create_dir_all(&dir)
    .map_err(|error| format!("could_not_create_external_library_dir: {error}"))?;

  let key = crate::library::roots::library_entry_key(&source.to_string_lossy(), title);
  let dest = dir.join(format!(
    "{}_{}.{}",
    sanitize_shortcut_file_stem(title),
    &key[..8.min(key.len())],
    ext
  ));
  std::fs::copy(source, &dest)
    .map_err(|error| format!("could_not_copy_shortcut: {error}"))?;
  Ok(dest)
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
  // Cópia em app_data: sobrevive a reinícios mesmo se o atalho original sumir do Desktop.
  let stored = persist_shortcut_copy(app, &url_file, &title).unwrap_or(url_file);
  let dest_path = stored.to_string_lossy().to_string();
  let conn = open_database_connection(app)?;
  remember_library_game_root(&conn, &dest_path, &title, &stored)?;
  upsert_library_launch_exe(&conn, &dest_path, &title, &stored)?;
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
  // Atalhos: pela extensão do path (mesmo se o ficheiro foi apagado entretanto).
  if is_shortcut_path(dest) || is_shortcut_path(root) {
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

    let (title, display) =
      if let Some(migrated) = migrate_shortcut_into_app_data(app, &title, &dest, &root) {
        migrated
      } else if dest.exists() {
        (title, dest)
      } else if root.exists() {
        (title, root)
      } else if is_shortcut_path(&dest) {
        (title, dest)
      } else if is_shortcut_path(&root) {
        (title, root)
      } else {
        continue;
      };

    let is_dir = display.is_dir();
    if !is_dir && !is_shortcut_path(&display) {
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

fn is_under_app_external_dir(app: &AppHandle, path: &Path) -> bool {
  use tauri::Manager;
  let Ok(data) = app.path().app_data_dir() else {
    return false;
  };
  path_under_root(path, &data.join("external_library"))
}

/// Se o atalho ainda está fora de app_data, copia e actualiza a DB.
fn migrate_shortcut_into_app_data(
  app: &AppHandle,
  title: &str,
  dest: &Path,
  root: &Path,
) -> Option<(String, PathBuf)> {
  let source = if dest.is_file() && is_shortcut_path(dest) {
    dest
  } else if root.is_file() && is_shortcut_path(root) {
    root
  } else {
    return None;
  };
  if is_under_app_external_dir(app, source) {
    return None;
  }
  let stored = persist_shortcut_copy(app, source, title).ok()?;
  let dest_path = stored.to_string_lossy().to_string();
  let conn = open_database_connection(app).ok()?;
  // Remove chave antiga (path Desktop) e grava a cópia estável.
  let _ = conn.execute(
    "DELETE FROM library_game_roots WHERE lower(dest_path) = lower(?1) OR lower(game_root) = lower(?1)",
    rusqlite::params![source.to_string_lossy().to_string()],
  );
  let _ = conn.execute(
    "DELETE FROM library_launch_exe WHERE lower(dest_path) = lower(?1)",
    rusqlite::params![source.to_string_lossy().to_string()],
  );
  remember_library_game_root(&conn, &dest_path, title, &stored).ok()?;
  let _ = upsert_library_launch_exe(&conn, &dest_path, title, &stored);
  Some((title.to_string(), stored))
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
