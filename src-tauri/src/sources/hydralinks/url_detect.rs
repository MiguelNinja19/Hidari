use crate::config;
use std::path::Path;

pub fn is_json_catalog_source(url: &str) -> bool {
  let lower = url.trim().to_lowercase();
  lower.ends_with(".json") || lower.contains("hydralinks.cloud/sources/")
}

pub fn is_local_catalog_path(value: &str) -> bool {
  let trimmed = value.trim();
  if trimmed.is_empty() {
    return false;
  }
  if trimmed.starts_with("file://") {
    return true;
  }
  let path = Path::new(trimmed);
  path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
    && (path.is_absolute() || trimmed.contains('\\') || trimmed.starts_with("./") || trimmed.starts_with("../"))
}

pub fn is_remote_catalog_url(value: &str) -> bool {
  let trimmed = value.trim();
  (trimmed.starts_with("http://") || trimmed.starts_with("https://"))
    && is_json_catalog_source(trimmed)
}

/// Normaliza URLs oficiais do hydralinks (ex.: sem `/sources/`).
pub fn normalize_remote_catalog_url(url: &str) -> Result<String, String> {
  let trimmed = url.trim();
  if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
    return Err(
      "A URL deve começar com http:// ou https:// e apontar para um catálogo .json.".to_string(),
    );
  }
  if !is_json_catalog_source(trimmed) {
    return Err(
      "Use uma URL de catálogo .json (ex.: https://hydralinks.cloud/sources/fitgirl.json)."
        .to_string(),
    );
  }

  let lower = trimmed.to_lowercase();
  if lower.contains("hydralinks.cloud/") && !lower.contains("/sources/") {
    if let Some(file_name) = Path::new(trimmed)
      .file_name()
      .and_then(|name| name.to_str())
      .filter(|name| name.to_lowercase().ends_with(".json"))
    {
      return Ok(format!(
        "{}/{}",
        config::HYDRALINKS_SOURCES_BASE.trim_end_matches('/'),
        file_name
      ));
    }
  }

  Ok(trimmed.to_string())
}
