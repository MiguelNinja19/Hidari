use super::paths_local::resolve_local_catalog_path;
use std::path::Path;

pub fn json_slug_from_url(url: &str) -> Option<String> {
  let trimmed = url.trim().trim_end_matches('/');
  let file = Path::new(trimmed)
    .file_name()
    .and_then(|name| name.to_str())
    .or_else(|| trimmed.rsplit('/').next())?;
  let lower = file.to_ascii_lowercase();
  let stem = lower
    .strip_suffix(".json")
    .map(|value| value.to_string())?;
  if stem.is_empty() {
    return None; }
  // Preserve original stem casing from the filename when possible.
  let original_stem = file
    .get(..stem.len())
    .filter(|value| value.len() == stem.len())
    .unwrap_or(stem.as_str());
  Some(original_stem.to_string()) }

pub fn display_name_for_source_url(url: &str) -> String {
  if let Some(slug) = json_slug_from_url(url) {
    return polish_source_display_name(&slug);
  }
  if let Some(path) = resolve_local_catalog_path(url) {
    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
      return polish_source_display_name(stem);
    } }
  let lower = url.to_lowercase();
  if lower.contains("fitgirl-repacks.site") || lower.contains("fitgirl") {
    return "FitGirl".to_string();
  }
  "Fonte personalizada".to_string()
}

/// Nome amigável: prioriza o `name` do JSON, depois API, depois a URL.
pub fn resolve_source_display_name(
  catalog_name: Option<&str>,
  api_name: Option<&str>,
  url_or_path: &str, ) -> String {
  for candidate in [catalog_name, api_name] {
    if let Some(name) = candidate.map(str::trim).filter(|value| !value.is_empty()) {
      return polish_source_display_name(name);
    } }
  display_name_for_source_url(url_or_path)
}

pub fn polish_source_display_name(name: &str) -> String {
  let trimmed = name.trim();
  if trimmed.is_empty() {
    return "Fonte personalizada".to_string();
  }

  let without_ext = trimmed
    .strip_suffix(".json")
    .or_else(|| trimmed.strip_suffix(".JSON"))
    .unwrap_or(trimmed) .trim();
  if without_ext.is_empty() {
    return "Fonte personalizada".to_string();
  }

  humanize_source_slug(without_ext)
}

fn humanize_source_slug(slug: &str) -> String {
  match slug.to_ascii_lowercase().as_str() {
    "fitgirl" => return "FitGirl".to_string(),
    "xatab" => return "XATAB".to_string(),
    "dodi" => return "DODI".to_string(),
    "steamrip" => return "SteamRip".to_string(),
    "gog" => return "GOG".to_string(),
    "onlinefix" | "online-fix" => return "Online-Fix".to_string(),
    "kaoskrew" | "kaos-krew" => return "KaOsKrew".to_string(),
    "elamigos" => return "ElAmigos".to_string(),
    "atop" => return "ATOP".to_string(),
    "empress" => return "EMPRESS".to_string(),
    _ => {} }

  // Já parece um nome legível (espaços ou maiúsculas no meio).
  if slug.contains(' ')
    || slug.chars().any(|c| c.is_ascii_uppercase()) && slug.chars().any(|c| c.is_ascii_lowercase())
  { return slug.to_string(); }
  let normalized = slug.replace(['-', '_'], " ");
  if normalized .chars()
    .all(|c| c.is_ascii_uppercase() || !c.is_alphabetic())
  { return normalized;
  } normalized .split_whitespace()
    .map(|word| {
      let mut chars = word.chars();
      match chars.next() {
        None => String::new(),
        Some(first) => {
          let mut out = first.to_ascii_uppercase().to_string();
          out.push_str(&chars.as_str().to_ascii_lowercase());
          out } } })
    .collect::<Vec<_>>()
    .join(" ") }
