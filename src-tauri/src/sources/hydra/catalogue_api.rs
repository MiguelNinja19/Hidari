use super::{
  api_base_url, api_http_error, hydra_http_client, HydraCatalogueSearchResponse,
  HydraGameRepack,
};

pub(crate) async fn hydra_catalogue_search(
  title: &str,
  fingerprints: &[String],
  take: usize,
  skip: usize,
) -> Result<HydraCatalogueSearchResponse, String> {
  let response = hydra_http_client()?
    .post(format!("{}/catalogue/search", api_base_url()))
    .json(&serde_json::json!({
      "title": title.trim(), "take": take.max(5), "skip": skip,
      "sortBy": "popularity", "sortOrder": "desc",
      "downloadSourceFingerprints": fingerprints, "tags": [], "publishers": [],
      "genres": [], "developers": [], "protondbSupportBadges": [],
      "deckCompatibility": [],
    }))
    .send()
    .await
    .map_err(|error| format!("Falha na pesquisa do catálogo Hydra: {error}"))?;
  if response.status().is_success() {
    return response.json().await
      .map_err(|error| format!("Resposta inválida da pesquisa Hydra: {error}"));
  }
  let status = response.status().as_u16();
  let snippet = response.text().await.unwrap_or_default().chars().take(120).collect();
  Err(api_http_error(status, snippet, "pesquisar catálogo"))
}

pub async fn hydra_game_download_sources(
  shop: &str,
  object_id: &str,
  source_ids: &[String],
) -> Result<Vec<HydraGameRepack>, String> {
  if source_ids.is_empty() {
    return Ok(Vec::new());
  }
  let mut request = hydra_http_client()?
    .get(format!("{}/games/{}/{}/download-sources", api_base_url(), shop.trim(), object_id.trim()))
    .query(&[("take", "100"), ("skip", "0")]);
  for id in source_ids {
    request = request.query(&[("downloadSourceIds[]", id)]);
  }
  let response = request.send().await
    .map_err(|error| format!("Falha ao obter opções de download: {error}"))?;
  if response.status().is_success() {
    return response.json().await
      .map_err(|error| format!("Resposta inválida de downloads Hydra: {error}"));
  }
  let status = response.status().as_u16();
  let snippet = response.text().await.unwrap_or_default().chars().take(120).collect();
  Err(api_http_error(status, snippet, "obter downloads"))
}
