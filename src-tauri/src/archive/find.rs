use super::extensions::{is_archive_extension, is_payload_extension};
use super::volume::prefer_archive_volume;
use super::walk::{resolve_job_folder, walk_download_candidates};
use std::path::PathBuf;

fn title_tokens(title: &str) -> Vec<String> {
  title
    .to_ascii_lowercase()
    .split(|c: char| !c.is_ascii_alphanumeric())
    .filter(|t| t.len() >= 3)
    .filter(|t| !matches!(*t, "the" | "and" | "for" | "ver" | "version"))
    .map(str::to_string)
    .collect()
}

fn path_title_score(path: &PathBuf, tokens: &[String]) -> usize {
  if tokens.is_empty() {
    return 0;
  }
  let hay = path.to_string_lossy().to_ascii_lowercase();
  tokens.iter().filter(|token| hay.contains(token.as_str())).count()
}

fn collect_archives(dest_path: &str) -> Vec<(u64, PathBuf)> {
  let path = PathBuf::from(dest_path);
  if path.is_file() && is_archive_extension(&path) {
    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    return vec![(size, path)];
  }
  let folder = resolve_job_folder(dest_path);
  if !folder.exists() || !folder.is_dir() {
    return Vec::new();
  }
  let mut archives = Vec::new();
  let mut payloads = Vec::new();
  walk_download_candidates(&folder, 0, &mut archives, &mut payloads);
  archives
}

/// Finds the best archive candidate for a job destination path (inclui subpastas de torrent).
pub fn find_job_archive(dest_path: &str) -> Option<PathBuf> {
  let mut archives = collect_archives(dest_path);
  archives.sort_by_key(|a| std::cmp::Reverse(a.0));
  let paths: Vec<PathBuf> = archives.into_iter().map(|(_, p)| p).collect();
  prefer_archive_volume(paths)
}

/// Como `find_job_archive`, mas prefere ficheiros cujo caminho bate com o título do jogo.
/// Evita pegar no .rar de outro jogo quando `dest_path` é a pasta raiz de downloads.
pub fn find_job_archive_for_title(dest_path: &str, title: &str) -> Option<PathBuf> {
  let tokens = title_tokens(title);
  let mut archives = collect_archives(dest_path);
  if archives.is_empty() {
    return None;
  }
  if !tokens.is_empty() {
    let mut scored: Vec<(usize, u64, PathBuf)> = archives
      .into_iter()
      .map(|(size, path)| (path_title_score(&path, &tokens), size, path))
      .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1)));
    if let Some((score, _, path)) = scored.first() {
      if *score > 0 {
        return Some(path.clone());
      }
    }
    let paths: Vec<PathBuf> = scored.into_iter().map(|(_, _, p)| p).collect();
    return prefer_archive_volume(paths);
  }
  archives.sort_by_key(|a| std::cmp::Reverse(a.0));
  let paths: Vec<PathBuf> = archives.into_iter().map(|(_, p)| p).collect();
  prefer_archive_volume(paths)
}

/// Maior ficheiro útil do download — arquivo ou instalador (procura em subpastas).
pub fn find_download_payload(dest_path: &str) -> Option<PathBuf> {
  let path = PathBuf::from(dest_path);
  if path.is_file() {
    if is_archive_extension(&path) || is_payload_extension(&path) {
      return Some(path);
    }
    return None;
  }

  if let Some(archive) = find_job_archive(dest_path) {
    return Some(archive);
  }

  let folder = resolve_job_folder(dest_path);
  if !folder.is_dir() {
    return None;
  }

  let mut archives = Vec::new();
  let mut payloads = Vec::new();
  walk_download_candidates(&folder, 0, &mut archives, &mut payloads);
  payloads.sort_by_key(|a| std::cmp::Reverse(a.0));
  payloads.into_iter().next().map(|(_, path)| path)
}
