use super::colon::strip_colon_update_suffix;
use super::normalize::clean_title_for_matching;
use super::regex::{catalog_base_title_regex, strip_trailing_version_suffix};

fn extract_catalog_base_title_once(title: &str) -> String {
  let normalized = title.replace(['™', '®', '©'], "").trim().to_string();
  if normalized.is_empty() {
    return String::new();
  }
  let base = catalog_base_title_regex()
    .captures(&normalized)
    .and_then(|caps| caps.get(1))
    .map(|m| m.as_str().trim().to_string())
    .filter(|value| !value.is_empty())
    .unwrap_or(normalized);
  strip_trailing_version_suffix(&base)
}

/// Nome base do jogo (sem edition, versão, repack, parênteses ou colchetes).
pub fn extract_catalog_base_title(title: &str) -> String {
  let mut working = clean_title_for_matching(title);
  if working.is_empty() {
    return String::new();
  }
  for _ in 0..8 {
    let cleaned = clean_title_for_matching(&working);
    if !cleaned.is_empty() {
      working = cleaned;
    }
    let next = strip_colon_update_suffix(&extract_catalog_base_title_once(&working));
    if next == working {
      return next;
    }
    working = next;
  }
  working
}
