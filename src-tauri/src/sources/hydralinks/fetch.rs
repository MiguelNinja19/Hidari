use super::paths::catalog_file_name_from_path;
use super::paths::hydralinks_mirror_url_for_file;
use super::parse::{looks_like_html_catalog, parse_catalog_json};
use super::source_resolve::resolve_remote_catalog_url;
use super::url_detect::normalize_remote_catalog_url;
use crate::dto::HydraSourceDto;
use std::time::Duration;

pub(crate) fn catalog_fetch_candidates(source: &HydraSourceDto) -> Result<Vec<(String, String)>, String> {
  let remote = resolve_remote_catalog_url(source).ok_or_else(|| {
    "Não foi possível determinar a URL remota desta fonte.".to_string()
  })?;
  let normalized = normalize_remote_catalog_url(&remote)?;
  let mut candidates = vec![("URL oficial".to_string(), normalized.clone())];

  if let Ok(file_name) = catalog_file_name_from_path(&normalized) {
    if let Some(mirror) = hydralinks_mirror_url_for_file(&file_name) {
      if mirror != normalized {
        candidates.push(("espelho configurado".to_string(), mirror));
      }
    }
  }

  Ok(candidates)
}
fn remote_fetch_error(label: &str, status: reqwest::StatusCode) -> String {
  if status.as_u16() == 403 {
    return format!("{label}: bloqueado (Cloudflare 403)");
  }
  format!("{label}: HTTP {status}")
}

async fn fetch_remote_catalog_body(remote_url: &str, label: &str) -> Result<String, String> {
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(90))
    .user_agent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
       (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    )
    .build()
    .map_err(|error| format!("Não foi possível preparar o cliente HTTP: {error}"))?;

  let response = client
    .get(remote_url)
    .header("Accept", "application/json, text/plain, */*")
    .send()
    .await
    .map_err(|error| format!("{label}: falha ao baixar ({error})"))?;

  if !response.status().is_success() {
    return Err(remote_fetch_error(label, response.status()));
  }

  response
    .text()
    .await
    .map_err(|error| format!("{label}: não foi possível ler a resposta ({error})"))
}

async fn fetch_catalog_body_from_candidates(
  candidates: &[(String, String)],
) -> Result<(String, String), String> {
  let mut errors: Vec<String> = Vec::new();

  for (label, url) in candidates {
    match fetch_remote_catalog_body(url, label).await {
      Ok(body) if looks_like_html_catalog(&body) => {
        errors.push(format!("{label}: resposta HTML inválida"));
      }
      Ok(body) => match parse_catalog_json(&body) {
        Ok(_) => return Ok((body, label.clone())),
        Err(error) => errors.push(format!("{label}: {error}")),
      },
      Err(error) => errors.push(error),
    }
  }

  Err(format!(
    "Não foi possível baixar o catálogo online. {}",
    errors.join(" · ")
  ))
}

pub(crate) async fn fetch_catalog_body_for_source(source: &HydraSourceDto) -> Result<(String, String), String> {
  let candidates = catalog_fetch_candidates(source)?;
  fetch_catalog_body_from_candidates(&candidates).await
}
