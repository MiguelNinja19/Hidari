use crate::db::open_database_connection;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;
use url::form_urlencoded;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDesktopShortcutPayload {
  pub title: String,
  pub dest_path: String,
  #[serde(default)]
  pub icon_path: Option<String>,
}

fn sanitize_shortcut_name(title: &str) -> String {
  let cleaned: String = title
    .chars()
    .map(|c| match c {
      '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
      c if c.is_control() => '_',
      c => c,
    })
    .collect::<String>()
    .trim()
    .trim_matches('.')
    .to_string();
  let mut name = if cleaned.is_empty() {
    "Game".to_string()
  } else {
    cleaned
  };
  if name.len() > 80 {
    name.truncate(80);
    name = name.trim_end_matches('.').trim().to_string();
    if name.is_empty() {
      name = "Game".to_string();
    }
  }
  name
}

fn build_launch_url(title: &str, dest_path: &str) -> String {
  let query = form_urlencoded::Serializer::new(String::new())
    .append_pair("title", title)
    .append_pair("path", dest_path)
    .finish();
  format!("hidari://launch?{query}")
}

fn ps_quote(value: &str) -> String {
  format!("'{}'", value.replace('\'', "''"))
}

fn resolve_icon_path(app: &AppHandle, title: &str, icon_path: Option<&str>) -> PathBuf {
  if let Some(path) = icon_path.map(str::trim).filter(|value| !value.is_empty()) {
    let candidate = PathBuf::from(path);
    if candidate.is_file() {
      return candidate;
    }
  }
  if let (Ok(conn), Ok(covers_dir)) = (
    open_database_connection(app),
    crate::covers::covers_dir_for_app(app),
  ) {
    if let Some(local) = crate::covers::lookup_cover_row_for_title(&conn, title)
      .and_then(|(_, local)| local)
      .filter(|path| crate::covers::is_usable_cover_file(Path::new(path), &covers_dir))
    {
      return PathBuf::from(local);
    }
  }
  std::env::current_exe().unwrap_or_else(|_| PathBuf::from("Hidari.exe"))
}

#[cfg(windows)]
fn create_windows_desktop_shortcut(
  app: &AppHandle,
  title: &str,
  dest_path: &str,
  icon_path: Option<&str>,
) -> Result<String, String> {
  let exe = std::env::current_exe().map_err(|error| format!("could_not_resolve_exe: {error}"))?;
  let work_dir = exe
    .parent()
    .map(Path::to_path_buf)
    .unwrap_or_else(|| PathBuf::from("."));
  let icon = resolve_icon_path(app, title, icon_path);
  let launch_url = build_launch_url(title, dest_path);
  let file_name = format!("{}.lnk", sanitize_shortcut_name(title));
  let icon_location = format!("{},0", icon.to_string_lossy());

  let script = format!(
    "$ErrorActionPreference='Stop'; \
     $desktop=[Environment]::GetFolderPath('Desktop'); \
     if(-not $desktop){{ throw 'desktop_folder_not_found' }}; \
     $lnk=Join-Path $desktop {}; \
     $s=(New-Object -ComObject WScript.Shell).CreateShortcut($lnk); \
     $s.TargetPath={}; \
     $s.Arguments={}; \
     $s.WorkingDirectory={}; \
     $s.IconLocation={}; \
     $s.Description={}; \
     $s.Save(); \
     $lnk",
    ps_quote(&file_name),
    ps_quote(&exe.to_string_lossy()),
    ps_quote(&launch_url),
    ps_quote(&work_dir.to_string_lossy()),
    ps_quote(&icon_location),
    ps_quote(title),
  );

  let output = Command::new("powershell")
    .args([
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      &script,
    ])
    .output()
    .map_err(|error| format!("could_not_run_powershell: {error}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    return Err(if stderr.is_empty() {
      "could_not_create_desktop_shortcut".to_string()
    } else {
      format!("could_not_create_desktop_shortcut: {stderr}")
    });
  }

  let created = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if created.is_empty() {
    return Err("could_not_create_desktop_shortcut".to_string());
  }
  Ok(created)
}

#[cfg(not(windows))]
fn create_windows_desktop_shortcut(
  _app: &AppHandle,
  _title: &str,
  _dest_path: &str,
  _icon_path: Option<&str>,
) -> Result<String, String> {
  Err("desktop_shortcut_unsupported".to_string())
}

#[tauri::command]
pub fn create_library_desktop_shortcut(
  app: AppHandle,
  payload: CreateDesktopShortcutPayload,
) -> Result<String, String> {
  let title = payload.title.trim();
  let dest_path = payload.dest_path.trim();
  if title.is_empty() {
    return Err("missing_title".to_string());
  }
  if dest_path.is_empty() {
    return Err("missing_path".to_string());
  }
  let _ = crate::path_security::validate_managed_path(&app, dest_path)?;
  create_windows_desktop_shortcut(
    &app,
    title,
    dest_path,
    payload.icon_path.as_deref(),
  )
}
