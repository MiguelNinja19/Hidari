use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathsPayload {
  pub app_data_dir: String,
  pub app_config_dir: String,
  pub app_cache_dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLibraryItemDto {
  pub name: String,
  pub path: String,
  pub is_dir: bool,
  pub size_bytes: u64,
  pub modified_at: u64,
  /// Importado pelo utilizador (não veio do download Hidari).
  #[serde(default)]
  pub external: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteLocalLibraryItemPayload {
  pub path: String,
  #[serde(default)]
  pub title: Option<String>,
}
