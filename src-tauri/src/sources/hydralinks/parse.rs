use super::types::{HydraLinksCatalog, HydraLinksDownload};
use serde::{Deserialize, Deserializer};
use std::path::Path;

pub(crate) fn deserialize_uris_flexible<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
  D: Deserializer<'de>,
{ use serde::de::Error;
  let value = serde_json::Value::deserialize(deserializer)?;
  match value {
    serde_json::Value::Array(items) => Ok(items
      .into_iter()
      .filter_map(|item| item.as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string))
      .collect()),
    serde_json::Value::String(text) => {
      let trimmed = text.trim();
      if trimmed.is_empty() {
        Ok(Vec::new()) } else {
        Ok(vec![trimmed.to_string()]) } }
    serde_json::Value::Null => Ok(Vec::new()),
    _ => Err(Error::custom("uris deve ser uma lista ou texto")),
  } } fn strip_utf8_bom(body: &str) -> &str {
  body.strip_prefix('\u{FEFF}').unwrap_or(body)
}

pub(crate) fn normalize_catalog_body(body: &str) -> String {
  strip_utf8_bom(body).trim().to_string() }

pub(crate) fn looks_like_html_catalog(body: &str) -> bool {
  let trimmed = body.trim_start();
  let head = trimmed .chars() .take(128)
    .collect::<String>()
    .to_ascii_lowercase();
  head.starts_with("<!doctype")
    || head.starts_with("<html")
    || (head.starts_with('<') && head.contains("<head"))
}

fn downloads_from_json_value(value: serde_json::Value) -> Result<Vec<HydraLinksDownload>, String> {
  let array = match value {
    serde_json::Value::Array(items) => items,
    serde_json::Value::Object(map) => {
      for key in ["downloads", "repacks", "items", "games"] {
        if let Some(serde_json::Value::Array(items)) = map.get(key) {
          return serde_json::from_value(serde_json::Value::Array(items.clone()))
            .map_err(|error| format!("Entradas em \"{key}\" inválidas: {error}"));
        } } return Err(
        "Falta a lista \"downloads\" (ou \"repacks\"). Formato: { \"name\": \"...\", \"downloads\": [ ... ] }."
          .to_string(),
      ); } _ => { return Err(
        "O arquivo deve ser um objeto JSON com \"downloads\" ou uma lista de jogos.".to_string(),
      ); } };

  serde_json::from_value(serde_json::Value::Array(array))
    .map_err(|error| format!("Entradas do catálogo inválidas: {error}"))
}

pub(crate) fn parse_catalog_json(body: &str) -> Result<HydraLinksCatalog, String> {
  let normalized = normalize_catalog_body(body);
  if normalized.is_empty() {
    return Err("O arquivo está vazio.".to_string());
  }
  if looks_like_html_catalog(&normalized) {
    return Err(
      "O arquivo selecionado não é JSON — parece ser texto/HTML. \
Use um catálogo .json no formato Hydra (objeto com \"name\" e \"downloads\")."
        .to_string(), ); }

  let value: serde_json::Value = serde_json::from_str(&normalized).map_err(|error| {
    format!(
      "JSON inválido. O arquivo deve ter \"downloads\" com \"title\" e \"uris\". Detalhe: {error}"
    ) })?;

  let name = value .get("name")
    .and_then(|v| v.as_str())
    .map(str::to_string);

  let mut downloads = match serde_json::from_value::<HydraLinksCatalog>(value.clone()) {
    Ok(catalog) => catalog.downloads,
    Err(_) => downloads_from_json_value(value)?,
  };

  downloads.retain(|entry| {
    !entry.title.trim().is_empty() && !entry.uris.is_empty()
  });

  if downloads.is_empty() { return Err(
      "Nenhuma entrada válida encontrada — cada item precisa de \"title\" e pelo menos um link em \"uris\"."
        .to_string(), ); }
  Ok(HydraLinksCatalog { name, downloads })
}
pub(crate) fn read_catalog_file(path: &Path) -> Result<(HydraLinksCatalog, String), String> {
  let raw = std::fs::read_to_string(path).map_err(|error| {
    format!(
      "Não foi possível ler \"{}\": {error}",
      path.display() ) })?;
  let body = normalize_catalog_body(&raw);
  let catalog = parse_catalog_json(&body)?;
  Ok((catalog, body)) }
