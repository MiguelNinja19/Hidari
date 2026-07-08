//! Deteção genérica de executáveis a partir do **título do job** (download).
//! Não existe lista fixa de jogos: o motor tokeniza o título, procura pastas/setup.exe
//! e pontua candidatos .exe com heurísticas (tamanho, shipping, tokens, redist, etc.).

use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;

use crate::archive;
use crate::title;

/// True when the file begins with a valid Windows PE executable header.
pub fn is_valid_pe_executable(path: &Path) -> bool {
  let mut file = match fs::File::open(path) {
    Ok(value) => value,
    Err(_) => return false,
  };

  let mut dos = [0u8; 64];
  if file.read_exact(&mut dos).is_err() {
    return false;
  }
  if dos[0] != b'M' || dos[1] != b'Z' {
    return false;
  }

  let pe_offset = u32::from_le_bytes([dos[0x3c], dos[0x3d], dos[0x3e], dos[0x3f]]);
  if pe_offset < 0x40 {
    return false;
  }

  if file.seek(SeekFrom::Start(pe_offset as u64)).is_err() {
    return false;
  }

  let mut pe = [0u8; 4];
  if file.read_exact(&mut pe).is_err() {
    return false;
  }

  pe == *b"PE\0\0"
}

fn is_store_or_platform_launcher_exe(file_name: &str, path: &Path) -> bool {
  let lower = file_name.to_lowercase();
  let stem = lower.strip_suffix(".exe").unwrap_or(&lower);

  const BLOCKED_STEMS: &[&str] = &[
    "steam",
    "steamservice",
    "steamerror",
    "steambootstrapper",
    "steamwebhelper",
    "gameoverlayui",
    "epicgameslauncher",
    "origin",
    "originwebhelper",
    "upc",
    "uplay",
    "uplaylauncher",
    "goggalaxy",
    "galaxyclient",
    "galaxycommunication",
    "bethesdanetlauncher",
    "eadesktop",
    "eacomponent",
    "rockstargameslauncher",
    "rgl",
    "battlenet",
    "agent",
    "ubisoftgamelauncher",
    "xboxapp",
    "launcher",
    "gamelauncher",
    "game_launcher",
    "playnite",
    "playnitedesktop",
  ];
  if BLOCKED_STEMS.contains(&stem) {
    return true;
  }

  let path_lower = path.to_string_lossy().to_lowercase();
  if path_lower.contains("\\steam\\") && !path_lower.contains("\\steamapps\\common\\") {
    return true;
  }

  false
}

pub fn is_likely_game_exe(file_name: &str) -> bool {
  let lower = file_name.to_lowercase();
  let stem = lower.strip_suffix(".exe").unwrap_or(&lower);

  let blocked_exact = [
    "setup",
    "unins",
    "uninstall",
    "installer",
    "dxsetup",
    "dotnet",
    "unitycrashhandler",
    "websetup",
    "readme",
    "notification",
    "benchmark",
    "activator",
    "license",
  ];
  if blocked_exact.contains(&stem) {
    return false;
  }

  if is_store_or_platform_launcher_exe(file_name, Path::new(file_name)) {
    return false;
  }

  let blocked_contains = [
    "unins",
    "uninstall",
    "crashreport",
    "vcredist",
    "vc_redist",
    "easyanticheat",
    "battleye",
    "eac_",
    "_eac",
    "prereq",
    "prerequisite",
    "quicksfv",
    "md5sum",
    "checksum",
    "redist",
    "physx",
    "bepinex",
    "modloader",
    "webhelper",
    "crashhandler",
    "error",
    "debug",
    "sample",
    "dedicatedserver",
    "dedicated_server",
  ];
  !blocked_contains.iter().any(|token| lower.contains(token))
}

fn score_executable_candidate(path: &Path, depth: usize, title_tokens: &[String]) -> i64 {
  let file_name = path
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or_default()
    .to_lowercase();

  let mut score = 0i64;
  score -= (depth as i64) * 40;

  let size_mb = fs::metadata(path).map(|meta| meta.len() / (1024 * 1024)).unwrap_or(0) as i64;
  if (2..=800).contains(&size_mb) {
    score += 120;
  } else if size_mb < 1 {
    score -= 20;
  } else if size_mb > 800 {
    score -= 40;
  }

  if file_name.contains("win64-shipping") || file_name.contains("-shipping.exe") {
    score += 600;
  }
  if file_name == "game.exe" || file_name.ends_with("-game.exe") {
    score += 350;
  }
  if matches!(
    stem_of_exe(&file_name),
    "launcher" | "gamelauncher" | "start" | "run" | "play"
  ) {
    score -= 500;
  }

  for token in title_tokens {
    if file_name.contains(token) {
      score += 450;
    }
  }

  if let Some(parent) = path
    .parent()
    .and_then(|dir| dir.file_name())
    .and_then(|name| name.to_str())
  {
    let parent_lower = parent.to_lowercase();
    for token in title_tokens {
      if parent_lower.contains(token) {
        score += 180;
      }
    }
    if parent_lower == "bin" || parent_lower == "binaries" || parent_lower == "game" {
      score += 80;
    }
  }

  let path_lower = path.to_string_lossy().to_lowercase();
  for blocked_dir in [
    "redist",
    "_redist",
    "directx",
    "dotnet",
    "support",
    "tools",
    "extras",
    "bonus",
    "optional",
    "__installer",
    "md5",
  ] {
    if path_lower.contains(&format!("\\{blocked_dir}\\"))
      || path_lower.contains(&format!("/{blocked_dir}/"))
    {
      score -= 250;
    }
  }

  score
}

fn stem_of_exe(file_name: &str) -> &str {
  file_name
    .strip_suffix(".exe")
    .or_else(|| file_name.strip_suffix(".EXE"))
    .unwrap_or(file_name)
}

const SCAN_DEPTH_FAST: usize = 3;
const SCAN_DEPTH_FULL: usize = 10;

fn collect_executable_candidates(
  root: &Path,
  depth: usize,
  max_depth: usize,
  out: &mut Vec<(usize, PathBuf)>,
) {
  if depth > max_depth {
    return;
  }

  let entries = match fs::read_dir(root) {
    Ok(values) => values,
    Err(_) => return,
  };

  for entry in entries.flatten() {
    let path = entry.path();
    let metadata = match entry.metadata() {
      Ok(value) => value,
      Err(_) => continue,
    };

    if metadata.is_dir() {
      collect_executable_candidates(&path, depth + 1, max_depth, out);
      continue;
    }

    let is_exe = path
      .extension()
      .and_then(|ext| ext.to_str())
      .map(|ext| ext.eq_ignore_ascii_case("exe"))
      .unwrap_or(false);

    if is_exe {
      out.push((depth, path));
    }
  }
}

fn is_utility_subfolder(name: &str) -> bool {
  let lower = name.to_lowercase();
  matches!(
    lower.as_str(),
    "md5"
      | "_redist"
      | "redist"
      | "directx"
      | "dotnet"
      | "support"
      | "tools"
      | "extras"
      | "bonus"
      | "optional"
      | "__installer"
  )
}

fn folder_has_install_or_game(title: &str, folder: &Path) -> bool {
  let direct_setup = folder.join("setup.exe");
  if is_usable_setup_file(&direct_setup) {
    return true;
  }

  let title_tokens = title::tokenize_title(title);
  let Ok(entries) = fs::read_dir(folder) else {
    return false;
  };

  for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_file() {
      continue;
    }
    let is_exe = path
      .extension()
      .and_then(|ext| ext.to_str())
      .map(|ext| ext.eq_ignore_ascii_case("exe"))
      .unwrap_or(false);
    if !is_exe || !is_probably_executable(&path) {
      continue;
    }
    let file_name = path
      .file_name()
      .and_then(|value| value.to_str())
      .unwrap_or_default();
    if is_blocked_installer_exe(file_name) {
      continue;
    }
    if is_likely_game_exe(file_name) {
      return true;
    }
    let file_lower = file_name.to_lowercase();
    if title_tokens.iter().any(|token| file_lower.contains(token)) {
      return true;
    }
  }

  false
}

pub fn folder_has_playable_game_exe(title: &str, folder: &Path) -> bool {
  if !folder.is_dir() {
    return false;
  }

  let title_tokens = title::tokenize_title(title);
  let mut local: Vec<(usize, PathBuf)> = Vec::new();
  collect_executable_candidates(folder, 0, SCAN_DEPTH_FULL, &mut local);

  for (depth, path) in local {
    if !is_probably_executable(&path) {
      continue;
    }
    let file_name = path
      .file_name()
      .and_then(|value| value.to_str())
      .unwrap_or_default();
    if is_blocked_installer_exe(file_name) || is_store_or_platform_launcher_exe(file_name, &path) {
      continue;
    }
    if !is_likely_game_exe(file_name) {
      continue;
    }
    if score_executable_candidate(&path, depth, &title_tokens) > 0 {
      return true;
    }
  }

  false
}

fn find_title_matched_install_folder(title: &str, parent: &Path, skip: Option<&Path>) -> Option<PathBuf> {
  let tokens = title::tokenize_title(title);
  if tokens.is_empty() {
    return None;
  }

  let entries = fs::read_dir(parent).ok()?;
  let mut best: Option<(usize, PathBuf)> = None;

  for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_dir() {
      continue;
    }
    if skip.is_some_and(|value| value == path) {
      continue;
    }
    let name_lower = path
      .file_name()
      .and_then(|value| value.to_str())
      .unwrap_or_default()
      .to_lowercase();
    if is_utility_subfolder(&name_lower) {
      continue;
    }
    let matched_tokens = tokens
      .iter()
      .filter(|token| name_lower.contains(*token))
      .count();
    if matched_tokens == 0 || !folder_has_playable_game_exe(title, &path) {
      continue;
    }
    if best.as_ref().is_none_or(|(score, _)| matched_tokens > *score) {
      best = Some((matched_tokens, path));
    }
  }

  best.map(|(_, path)| path)
}

/// Quando o torrent grava em `J:\frangos\` mas o jogo fica em `J:\frangos\Nome [Repack]\`,
/// resolve a subpasta correta pelo título ou pela presença de setup.exe.
pub fn resolve_game_content_root(title: &str, dest_path: &str) -> PathBuf {
  let base = resolve_job_folder(dest_path);
  if folder_has_playable_game_exe(title, &base) {
    return base;
  }

  if let Some(parent) = base.parent().filter(|path| path.is_dir()) {
    if let Some(install_dir) = find_title_matched_install_folder(title, parent, Some(&base)) {
      return install_dir;
    }
  }

  if folder_has_install_or_game(title, &base) {
    return base;
  }

  let tokens = title::tokenize_title(title);
  let Ok(entries) = fs::read_dir(&base) else {
    return base;
  };

  let mut title_match: Option<PathBuf> = None;
  let mut best_score = 0usize;
  let mut setup_dirs: Vec<PathBuf> = Vec::new();
  for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_dir() {
      continue;
    }
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
      continue;
    };
    if is_utility_subfolder(name) {
      continue;
    }
    if is_usable_setup_file(&path.join("setup.exe")) {
      setup_dirs.push(path.clone());
    }
    let name_lower = name.to_lowercase();
    let matched_tokens = tokens.iter().filter(|token| name_lower.contains(*token)).count();
    if matched_tokens == 0 {
      continue;
    }
    if matched_tokens > best_score {
      best_score = matched_tokens;
      title_match = Some(path);
    }
  }

  if let Some(path) = title_match {
    return path;
  }

  if setup_dirs.len() == 1 {
    return setup_dirs.remove(0);
  }

  if setup_dirs.len() > 1 && !tokens.is_empty() {
    for dir in setup_dirs {
      let name_lower = dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();
      if tokens.iter().any(|token| name_lower.contains(token)) {
        return dir;
      }
    }
  }

  base
}

fn launch_roots_for_game(title: &str, dest_path: &str) -> Vec<PathBuf> {
  let content = resolve_game_content_root(title, dest_path);
  let mut roots = vec![content.clone()];

  for org in ["separate-folder", "single-folder"] {
    let extracted = archive::resolve_extract_destination(title, &content, org);
    if !roots.iter().any(|root| root == &extracted) {
      roots.push(extracted);
    }
  }

  // FitGirl: jogo instalado numa pasta irmã (ex. repack em `...\Nome [FitGirl]\`, jogo em `...\Nome\`).
  if is_usable_setup_file(&content.join("setup.exe")) {
    if let Some(parent) = content.parent().filter(|path| path.is_dir()) {
      if let Some(install_dir) = find_title_matched_install_folder(title, parent, Some(&content)) {
        if !roots.iter().any(|root| root == &install_dir) {
          roots.push(install_dir);
        }
      }
    }
  }

  roots
}

fn resolve_job_folder(dest_path: &str) -> PathBuf {
  let path = PathBuf::from(dest_path);
  if path.is_dir() {
    path
  } else {
    path.parent().map(Path::to_path_buf).unwrap_or(path)
  }
}

fn merge_launch_roots(
  title: &str,
  dest_path: &str,
  extra_roots: &[PathBuf],
) -> Vec<PathBuf> {
  let mut roots = launch_roots_for_game(title, dest_path);
  for root in extra_roots {
    if root.exists() && !roots.iter().any(|existing| existing == root) {
      roots.push(root.clone());
    }
  }
  roots
}

pub fn resolve_launch_candidates(title: &str, dest_path: &str) -> Result<Vec<PathBuf>, String> {
  resolve_launch_candidates_with_extra_roots(title, dest_path, &[])
}

pub fn resolve_launch_candidates_with_extra_roots(
  title: &str,
  dest_path: &str,
  extra_roots: &[PathBuf],
) -> Result<Vec<PathBuf>, String> {
  resolve_launch_candidates_with_extra_roots_depth(
    title,
    dest_path,
    extra_roots,
    SCAN_DEPTH_FULL,
  )
}

pub fn resolve_launch_candidates_with_extra_roots_depth(
  title: &str,
  dest_path: &str,
  extra_roots: &[PathBuf],
  max_depth: usize,
) -> Result<Vec<PathBuf>, String> {
  let roots = merge_launch_roots(title, dest_path, extra_roots);
  resolve_launch_candidates_in_roots(title, &roots, max_depth)
}

fn is_blocked_installer_exe(file_name: &str) -> bool {
  let lower = file_name.to_lowercase();
  let stem = lower.strip_suffix(".exe").unwrap_or(&lower);
  matches!(
    stem,
    "setup"
      | "unins"
      | "uninstall"
      | "installer"
      | "dxsetup"
      | "dotnet"
      | "vcredist"
      | "vc_redist"
      | "websetup"
      | "unitycrashhandler"
  ) || lower.contains("vcredist") || lower.contains("dxsetup")
    || lower.contains("quicksfv")
    || lower.contains("md5sum")
    || lower.contains("checksum")
    || is_store_or_platform_launcher_exe(file_name, Path::new(file_name))
}

/// Looser PE check for detection when strict validation fails on packed exes.
pub fn is_probably_executable(path: &Path) -> bool {
  if is_valid_pe_executable(path) {
    return true;
  }
  let mut buf = [0u8; 2];
  let Ok(mut file) = fs::File::open(path) else {
    return false;
  };
  file.read_exact(&mut buf).is_ok() && buf == [b'M', b'Z']
}

fn resolve_launch_candidates_in_roots(
  title: &str,
  roots: &[PathBuf],
  max_depth: usize,
) -> Result<Vec<PathBuf>, String> {
  let title_tokens = title::tokenize_title(title);
  let mut scored: Vec<(i64, PathBuf)> = Vec::new();
  let mut seen_paths = std::collections::HashSet::new();
  let mut any_root_exists = false;
  let mut relaxed: Vec<(i64, PathBuf)> = Vec::new();

  for root in roots {
    if !root.exists() {
      continue;
    }
    any_root_exists = true;

    let mut local: Vec<(usize, PathBuf)> = Vec::new();
    collect_executable_candidates(root, 0, max_depth, &mut local);

    for (depth, path) in local {
      if !is_probably_executable(&path) {
        continue;
      }

      let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();

      let key = path.to_string_lossy().to_lowercase();
      if !seen_paths.insert(key) {
        continue;
      }

      if !is_blocked_installer_exe(file_name) {
        relaxed.push((200 - (depth as i64) * 20, path.clone()));
      }

      if is_store_or_platform_launcher_exe(file_name, &path) {
        continue;
      }

      if !is_likely_game_exe(file_name) {
        continue;
      }

      let score = score_executable_candidate(&path, depth, &title_tokens);
      scored.push((score, path));
    }
  }

  if !any_root_exists {
    return Err("launch_target_root_not_found".to_string());
  }
  if scored.is_empty() {
    if relaxed.is_empty() {
      return Err("no_executable_found_in_job_folder".to_string());
    }
    scored = relaxed;
  }

  if !title_tokens.is_empty() {
    let title_matched: Vec<(i64, PathBuf)> = scored
      .iter()
      .filter(|(_, path)| {
        let file_name = path
          .file_name()
          .and_then(|value| value.to_str())
          .unwrap_or_default()
          .to_lowercase();
        title_tokens.iter().any(|token| file_name.contains(token))
      })
      .cloned()
      .collect();
    if !title_matched.is_empty() {
      scored = title_matched;
    }
  }

  scored.sort_by(|(score_a, path_a), (score_b, path_b)| {
    score_b
      .cmp(score_a)
      .then_with(|| path_a.as_os_str().cmp(path_b.as_os_str()))
  });

  Ok(scored.into_iter().map(|(_, path)| path).collect())
}

fn path_needs_literal_launch(target: &Path) -> bool {
  let value = target.to_string_lossy();
  value.contains(['[', ']', '&', '^', '%', '!'])
}

pub fn spawn_game_executable(launch_target: &Path) -> Result<(), String> {
  spawn_executable_with_fallbacks(launch_target, false, &[])
}

#[allow(dead_code)]
pub fn spawn_setup_executable(launch_target: &Path) -> Result<(), String> {
  let install_dir = launch_target
    .parent()
    .filter(|path| path.exists())
    .map(Path::to_path_buf);
  spawn_setup_executable_in(launch_target, install_dir.as_deref())
}

pub fn spawn_setup_executable_in(launch_target: &Path, install_dir: Option<&Path>) -> Result<(), String> {
  if !launch_target.is_file() {
    return Err(format!(
      "launch_target_not_found: {}",
      launch_target.to_string_lossy()
    ));
  }

  let work_dir = launch_target
    .parent()
    .filter(|path| path.exists())
    .map(Path::to_path_buf)
    .unwrap_or_else(|| PathBuf::from("."));

  let extra_args: Vec<String> = install_dir.map(inno_setup_args).unwrap_or_default();

  #[cfg(target_os = "windows")]
  {
    // Nunca cmd/start com /DIR= — paths com espaços ou & partem o comando do Windows.
    if spawn_via_create_process(launch_target, &work_dir, &extra_args).is_ok() {
      return Ok(());
    }
    spawn_via_powershell_process(launch_target, &work_dir, &extra_args)
  }

  #[cfg(not(target_os = "windows"))]
  {
    spawn_executable_with_fallbacks(launch_target, true, &extra_args)
  }
}

fn inno_setup_args(install_dir: &Path) -> Vec<String> {
  vec![
    format!("/DIR={}", install_dir.display()),
    "/SP-".to_string(),
  ]
}

fn spawn_executable_with_fallbacks(
  launch_target: &Path,
  prefer_shell: bool,
  extra_args: &[String],
) -> Result<(), String> {
  type SpawnExecutableFn = fn(&Path, &Path, &[String]) -> Result<(), String>;

  if !launch_target.is_file() {
    return Err(format!(
      "launch_target_not_found: {}",
      launch_target.to_string_lossy()
    ));
  }

  let work_dir = launch_target
    .parent()
    .filter(|path| path.exists())
    .map(Path::to_path_buf)
    .unwrap_or_else(|| PathBuf::from("."));

  #[cfg(target_os = "windows")]
  {
    let mut errors: Vec<String> = Vec::new();
    let literal = path_needs_literal_launch(launch_target);
    let attempts: &[SpawnExecutableFn] = if !extra_args.is_empty() {
      &[spawn_via_create_process, spawn_via_powershell_process]
    } else if literal {
      &[
        spawn_via_create_process,
        spawn_via_cmd_quoted_fullpath,
        spawn_via_powershell_process,
      ]
    } else if prefer_shell {
      &[
        spawn_via_cmd_start,
        spawn_via_create_process,
        spawn_via_cmd_quoted_fullpath,
        spawn_via_powershell_process,
      ]
    } else {
      &[
        spawn_via_create_process,
        spawn_via_cmd_start,
        spawn_via_cmd_quoted_fullpath,
        spawn_via_powershell_process,
      ]
    };

    for attempt in attempts {
      match attempt(launch_target, &work_dir, extra_args) {
        Ok(()) => return Ok(()),
        Err(error) => errors.push(error),
      }
    }

    if let Err(error) = spawn_via_explorer_select(launch_target) {
      errors.push(error);
    }

    Err(errors.join(" | "))
  }

  #[cfg(not(target_os = "windows"))]
  {
    StdCommand::new(launch_target)
      .current_dir(&work_dir)
      .spawn()
      .map(|_| ())
      .map_err(|error| error.to_string())
  }
}

#[cfg(target_os = "windows")]
fn spawn_via_create_process(target: &Path, work_dir: &Path, extra_args: &[String]) -> Result<(), String> {
  let mut command = StdCommand::new(target);
  command.current_dir(work_dir);
  for arg in extra_args {
    command.arg(arg);
  }
  command
    .spawn()
    .map(|_| ())
    .map_err(|error| format!("create_process: {error}"))
}

#[cfg(target_os = "windows")]
fn spawn_via_cmd_start(target: &Path, work_dir: &Path, extra_args: &[String]) -> Result<(), String> {
  use std::os::windows::process::CommandExt;

  const CREATE_NO_WINDOW: u32 = 0x08000000;
  let file_name = target
    .file_name()
    .and_then(|value| value.to_str())
    .ok_or_else(|| "cmd_start: invalid file name".to_string())?;

  // Usar nome relativo evita que o cmd interprete [ ] no caminho como wildcards.
  let mut cmd_line = vec![
    "/C".to_string(),
    "start".to_string(),
    "".to_string(),
    file_name.to_string(),
  ];
  cmd_line.extend(extra_args.iter().cloned());
  let cmd_refs: Vec<&str> = cmd_line.iter().map(String::as_str).collect();
  StdCommand::new("cmd")
    .current_dir(work_dir)
    .creation_flags(CREATE_NO_WINDOW)
    .args(cmd_refs)
    .spawn()
    .map(|_| ())
    .map_err(|error| format!("cmd_start: {error}"))
}

#[cfg(target_os = "windows")]
fn spawn_via_cmd_quoted_fullpath(
  target: &Path,
  work_dir: &Path,
  extra_args: &[String],
) -> Result<(), String> {
  use std::os::windows::process::CommandExt;

  const CREATE_NO_WINDOW: u32 = 0x08000000;
  let full = target.to_string_lossy();
  let mut cmd_line = vec![
    "/C".to_string(),
    "start".to_string(),
    "".to_string(),
    format!("\"{full}\""),
  ];
  cmd_line.extend(extra_args.iter().cloned());
  let cmd_refs: Vec<&str> = cmd_line.iter().map(String::as_str).collect();
  StdCommand::new("cmd")
    .current_dir(work_dir)
    .creation_flags(CREATE_NO_WINDOW)
    .args(cmd_refs)
    .spawn()
    .map(|_| ())
    .map_err(|error| format!("cmd_quoted_fullpath: {error}"))
}

#[cfg(target_os = "windows")]
fn spawn_via_powershell_process(
  target: &Path,
  work_dir: &Path,
  extra_args: &[String],
) -> Result<(), String> {
  use std::os::windows::process::CommandExt;

  const CREATE_NO_WINDOW: u32 = 0x08000000;
  let target_escaped = escape_powershell_single_quoted(&target.to_string_lossy());
  let work_escaped = escape_powershell_single_quoted(&work_dir.to_string_lossy());
  let args_joined = extra_args.join(" ");
  let script = if args_joined.is_empty() {
    format!(
      "$p=New-Object System.Diagnostics.ProcessStartInfo; $p.FileName='{target_escaped}'; $p.WorkingDirectory='{work_escaped}'; $p.UseShellExecute=$true; [void][Diagnostics.Process]::Start($p)"
    )
  } else {
    let args_escaped = escape_powershell_single_quoted(&args_joined);
    format!(
      "$p=New-Object System.Diagnostics.ProcessStartInfo; $p.FileName='{target_escaped}'; $p.WorkingDirectory='{work_escaped}'; $p.Arguments='{args_escaped}'; $p.UseShellExecute=$true; [void][Diagnostics.Process]::Start($p)"
    )
  };

  let mut child = StdCommand::new("powershell")
    .creation_flags(CREATE_NO_WINDOW)
    .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
    .spawn()
    .map_err(|error| format!("powershell_process: {error}"))?;

  let status = child
    .wait()
    .map_err(|error| format!("powershell_process: {error}"))?;

  if status.success() {
    Ok(())
  } else {
    Err(format!(
      "powershell_process: exit code {}",
      status.code().unwrap_or(-1)
    ))
  }
}

#[cfg(target_os = "windows")]
fn spawn_via_explorer_select(target: &Path) -> Result<(), String> {
  let argument = format!("/select,{}", target.to_string_lossy());
  StdCommand::new("explorer")
    .arg(argument)
    .spawn()
    .map(|_| ())
    .map_err(|error| format!("explorer_select: {error}"))
}

#[cfg(target_os = "windows")]
fn escape_powershell_single_quoted(value: &str) -> String {
  value.replace('\'', "''")
}

pub fn launch_game_candidates(candidates: &[PathBuf]) -> Result<PathBuf, String> {
  let mut last_error = String::from("nenhum executável válido encontrado");

  for path in candidates {
    if !is_valid_pe_executable(path) {
      continue;
    }
    match spawn_game_executable(path) {
      Ok(()) => return Ok(path.clone()),
      Err(error) => last_error = error,
    }
  }

  Err(last_error)
}

fn try_launch_executable(path: &Path) -> Result<(), String> {
  if !path.is_file() || !is_probably_executable(path) {
    return Err("not_executable".to_string());
  }
  let file_name = path
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or_default();
  if is_blocked_installer_exe(file_name) || is_store_or_platform_launcher_exe(file_name, path) {
    return Err("blocked_executable".to_string());
  }
  spawn_game_executable(path)
}

#[allow(dead_code)]
pub fn resolve_and_launch_game(title: &str, dest_path: &str) -> Result<PathBuf, String> {
  resolve_and_launch_game_with_extra_roots(title, dest_path, &[], None)
}

pub fn resolve_and_launch_game_with_extra_roots(
  title: &str,
  dest_path: &str,
  extra_roots: &[PathBuf],
  preferred_exe: Option<&Path>,
) -> Result<PathBuf, String> {
  if let Some(preferred) = preferred_exe {
    if try_launch_executable(preferred).is_ok() {
      return Ok(preferred.to_path_buf());
    }
  }

  if let Ok(candidates) = resolve_launch_candidates_with_extra_roots_depth(
    title,
    dest_path,
    extra_roots,
    SCAN_DEPTH_FAST,
  ) {
    if let Ok(path) = launch_game_candidates(&candidates) {
      return Ok(path);
    }
  }

  if let Ok(candidates) = resolve_launch_candidates_with_extra_roots(title, dest_path, extra_roots) {
    if let Ok(path) = launch_game_candidates(&candidates) {
      return Ok(path);
    }
  }

  if find_setup_executable_with_extra_roots(title, dest_path, extra_roots).is_some() {
    return Err("game_not_installed_use_installer".to_string());
  }

  Err("no_executable_found_in_job_folder".to_string())
}

pub fn job_has_game_executable(title: &str, dest_path: &str) -> bool {
  resolve_launch_candidates(title, dest_path).is_ok()
}

pub fn job_has_playable_executable(title: &str, dest_path: &str) -> bool {
  job_has_game_executable(title, dest_path) || find_setup_executable(title, dest_path).is_some()
}

pub fn find_setup_executable(title: &str, dest_path: &str) -> Option<PathBuf> {
  find_setup_executable_with_extra_roots(title, dest_path, &[])
}

pub fn find_setup_executable_with_extra_roots(
  title: &str,
  dest_path: &str,
  extra_roots: &[PathBuf],
) -> Option<PathBuf> {
  let roots = merge_launch_roots(title, dest_path, extra_roots);
  let mut matches: Vec<(usize, PathBuf)> = Vec::new();

  for root in roots {
    if !root.exists() {
      continue;
    }

    let direct = root.join("setup.exe");
    if is_usable_setup_file(&direct) {
      matches.push((0, direct));
    }

    let mut local: Vec<(usize, PathBuf)> = Vec::new();
    collect_executable_candidates(&root, 0, SCAN_DEPTH_FULL, &mut local);
    for (depth, path) in local {
      let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
        .unwrap_or_default();
      if file_name != "setup.exe" {
        continue;
      }
      if !is_usable_setup_file(&path) {
        continue;
      }
      matches.push((depth, path));
    }
  }

  matches.sort_by(|(depth_a, path_a), (depth_b, path_b)| {
    depth_a
      .cmp(depth_b)
      .then_with(|| path_a.as_os_str().cmp(path_b.as_os_str()))
  });
  matches.into_iter().map(|(_, path)| path).next()
}

fn is_usable_setup_file(path: &Path) -> bool {
  if !path.is_file() {
    return false;
  }
  let size = fs::metadata(path).map(|meta| meta.len()).unwrap_or(0);
  size >= 50_000
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::Write;

  const GAME_A: &str = "Galaxy Rangers";
  const GAME_B: &str = "Pixel Harvest";
  const GAME_LEGACY: &str = "Crystal Quest Legacy";

  fn pe_stub() -> Vec<u8> {
    let mut stub = vec![0u8; 0x100];
    stub[0] = b'M';
    stub[1] = b'Z';
    stub[0x3c] = 0x40;
    stub[0x40..0x44].copy_from_slice(b"PE\0\0");
    stub
  }

  #[test]
  fn rejects_non_pe_files() {
    let dir = std::env::temp_dir().join(format!("launcher_pe_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    let fake = dir.join("fake.exe");
    let mut file = fs::File::create(&fake).unwrap();
    file.write_all(b"not a real executable").unwrap();
    drop(file);

    assert!(!is_valid_pe_executable(&fake));

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn prefers_title_matching_executable() {
    let dir = std::env::temp_dir().join(format!("launcher_score_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    let blocked = dir.join("setup.exe");
    let preferred = dir.join("GalaxyRangers.exe");
    fs::write(&blocked, b"MZ").unwrap();
    fs::write(&preferred, b"MZ").unwrap();

    assert!(!is_likely_game_exe("setup.exe"));
    assert!(is_likely_game_exe("GalaxyRangers.exe"));

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn detects_playable_executable_without_archive() {
    let dir = std::env::temp_dir().join(format!("launcher_playable_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    fs::write(dir.join("TargetGame.exe"), pe_stub()).unwrap();

    assert!(job_has_playable_executable(GAME_A, &dir.to_string_lossy()));
    assert!(!job_has_playable_executable(GAME_A, "/nonexistent/path"));

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn finds_fitgirl_style_setup_without_strict_pe_header() {
    let dir = std::env::temp_dir().join(format!("launcher_setup_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    fs::write(dir.join("setup.exe"), vec![0u8; 60_000]).unwrap();

    assert!(find_setup_executable(GAME_A, &dir.to_string_lossy()).is_some());
    assert!(job_has_playable_executable(GAME_A, &dir.to_string_lossy()));
    assert!(!job_has_game_executable(GAME_A, &dir.to_string_lossy()));

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn resolves_title_subfolder_when_dest_is_parent_download_dir() {
    let parent = std::env::temp_dir().join(format!("launcher_parent_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&parent);
    let game_dir = parent.join(format!("{GAME_A} [FitGirl Repack]"));
    let other_dir = parent.join(format!("{GAME_B} [FitGirl Repack]"));
    let md5_dir = other_dir.join("MD5");
    fs::create_dir_all(&md5_dir).unwrap();
    fs::create_dir_all(&game_dir).unwrap();

    fs::write(game_dir.join("setup.exe"), vec![0u8; 60_000]).unwrap();
    fs::write(md5_dir.join("QuickSFV.EXE"), vec![0u8; 0x100]).unwrap();

    let resolved = resolve_game_content_root(GAME_A, &parent.to_string_lossy());
    assert_eq!(resolved, game_dir);
    assert!(!job_has_game_executable(GAME_A, &parent.to_string_lossy()));
    assert!(find_setup_executable(GAME_A, &parent.to_string_lossy())
      .unwrap()
      .ends_with("setup.exe"));

    let _ = fs::remove_dir_all(&parent);
  }

  #[test]
  fn does_not_pick_other_game_setup_folder() {
    let parent = std::env::temp_dir().join(format!("launcher_multi_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&parent);
    let game_a_dir = parent.join(format!("{GAME_A} [FitGirl Repack]"));
    let game_b_dir = parent.join(format!("{GAME_B} [FitGirl Repack]"));
    fs::create_dir_all(&game_a_dir).unwrap();
    fs::create_dir_all(&game_b_dir).unwrap();
    fs::write(game_a_dir.join("setup.exe"), vec![0u8; 60_000]).unwrap();
    fs::write(game_b_dir.join("setup.exe"), vec![0u8; 60_000]).unwrap();

    let resolved_b = resolve_game_content_root(GAME_B, &parent.to_string_lossy());
    let resolved_a = resolve_game_content_root(GAME_A, &parent.to_string_lossy());
    assert!(resolved_b.to_string_lossy().to_lowercase().contains("pixel"));
    assert!(resolved_a.to_string_lossy().to_lowercase().contains("galaxy"));

    let _ = fs::remove_dir_all(&parent);
  }

  #[test]
  fn setup_and_game_exe_means_game_not_install() {
    let dir = std::env::temp_dir().join(format!("launcher_both_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    fs::write(dir.join("setup.exe"), vec![0u8; 60_000]).unwrap();
    fs::write(dir.join("Pixel Harvest.exe"), pe_stub()).unwrap();

    assert!(job_has_game_executable(GAME_B, &dir.to_string_lossy()));
    assert!(resolve_launch_candidates(GAME_B, &dir.to_string_lossy()).is_ok());

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn does_not_launch_steam_or_generic_launcher() {
    let dir = std::env::temp_dir().join(format!("launcher_steam_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    let stub = pe_stub();
    fs::write(dir.join("Steam.exe"), &stub).unwrap();
    fs::write(dir.join("Launcher.exe"), &stub).unwrap();
    fs::write(dir.join("Crystal Quest Legacy.exe"), &stub).unwrap();

    assert!(!is_likely_game_exe("Steam.exe"));
    assert!(!is_likely_game_exe("Launcher.exe"));
    assert!(is_store_or_platform_launcher_exe("Steam.exe", &dir.join("Steam.exe")));
    assert!(is_store_or_platform_launcher_exe("Launcher.exe", &dir.join("Launcher.exe")));

    let candidates = resolve_launch_candidates(GAME_LEGACY, &dir.to_string_lossy()).unwrap();
    assert_eq!(candidates[0], dir.join("Crystal Quest Legacy.exe"));

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn resolves_installed_sibling_folder_instead_of_parent_scan() {
    let parent = std::env::temp_dir().join(format!("launcher_sibling_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&parent);
    let repack_dir = parent.join(format!("{GAME_LEGACY} [FitGirl Repack]"));
    let install_dir = parent.join(GAME_LEGACY);
    fs::create_dir_all(&repack_dir).unwrap();
    fs::create_dir_all(&install_dir).unwrap();

    fs::write(repack_dir.join("setup.exe"), vec![0u8; 60_000]).unwrap();
    fs::write(install_dir.join("Crystal Quest Legacy.exe"), pe_stub()).unwrap();

    let other_game = parent.join("Other Game [FitGirl Repack]");
    fs::create_dir_all(&other_game).unwrap();
    fs::write(other_game.join("Launcher.exe"), pe_stub()).unwrap();

    let resolved = resolve_game_content_root(GAME_LEGACY, &repack_dir.to_string_lossy());
    assert_eq!(resolved, install_dir);

    let candidates = resolve_launch_candidates(GAME_LEGACY, &repack_dir.to_string_lossy()).unwrap();
    assert_eq!(candidates[0], install_dir.join("Crystal Quest Legacy.exe"));

    let _ = fs::remove_dir_all(&parent);
  }
}
