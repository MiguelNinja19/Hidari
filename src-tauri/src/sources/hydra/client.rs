use super::HydraApiDownloadSource;

pub(crate) fn api_base_url() -> String {
  std::env::var("HYDRA_API_URL").unwrap_or_else(|_| crate::config::HYDRA_API_URL.to_string())
}

pub fn hydra_http_client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(90))
    .cookie_store(true)
    .user_agent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
       (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    )
    .build()
    .map_err(|error| format!("could_not_create_hydra_client: {error}"))
}

pub(crate) fn api_http_error(status: u16, snippet: String, action: &str) -> String {
  if status >= 500 {
    format!("API Hydra temporariamente indisponível (HTTP {status} ao {action}).")
  } else if snippet.is_empty() {
    format!("API Hydra respondeu HTTP {status} ao {action}")
  } else {
    format!("API Hydra respondeu HTTP {status} ao {action}: {snippet}")
  }
}

async fn source_request(
  path: &str,
  body: serde_json::Value,
  action: &str,
) -> Result<reqwest::Response, String> {
  let response = hydra_http_client()?
    .post(format!("{}{path}", api_base_url()))
    .json(&body)
    .send()
    .await
    .map_err(|error| format!("Falha ao {action} na API Hydra: {error}"))?;
  if response.status().is_success() {
    return Ok(response);
  }
  let status = response.status().as_u16();
  let snippet = response.text().await.unwrap_or_default().chars().take(120).collect();
  Err(api_http_error(status, snippet, action))
}

pub async fn hydra_register_download_source(url: &str) -> Result<HydraApiDownloadSource, String> {
  source_request("/download-sources", serde_json::json!({ "url": url.trim() }), "registrar fonte")
    .await?
    .json()
    .await
    .map_err(|error| format!("Resposta inválida da API Hydra: {error}"))
}

pub async fn hydra_sync_download_source(id: &str) -> Result<HydraApiDownloadSource, String> {
  let sources: Vec<HydraApiDownloadSource> = source_request(
    "/download-sources/sync", serde_json::json!({ "ids": [id] }), "sincronizar",
  )
  .await?
  .json()
  .await
  .map_err(|error| format!("Resposta inválida da API Hydra: {error}"))?;
  sources.into_iter().next().ok_or_else(|| "API Hydra não retornou a fonte.".to_string())
}

pub async fn hydra_refresh_download_source_meta(
  url: &str,
  existing_id: Option<&str>,
  _fingerprint: Option<&str>,
) -> Result<HydraApiDownloadSource, String> {
  match existing_id.filter(|id| !id.is_empty()) {
    Some(id) => hydra_sync_download_source(id).await,
    None => hydra_register_download_source(url).await,
  }
}

pub fn is_catalog_content_fingerprint(value: &str) -> bool {
  let value = value.trim();
  !value.starts_with("http://") && !value.starts_with("https://") && value.len() >= 16
}
