use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydraApiDownloadSource {
  pub id: String,
  pub name: String,
  #[allow(dead_code)]
  pub url: String,
  pub status: String,
  pub download_count: i64,
  pub fingerprint: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HydraCatalogueSearchResponse {
  #[allow(dead_code)]
  pub count: i64,
  pub edges: Vec<HydraCatalogueGame>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HydraCatalogueGame {
  pub object_id: String,
  pub title: String,
  pub shop: String,
  pub library_image_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydraGameRepack {
  #[allow(dead_code)]
  pub id: String,
  pub title: String,
  pub file_size: Option<String>,
  pub uris: Vec<String>,
  pub download_source_id: String,
  pub download_source_name: String,
}
