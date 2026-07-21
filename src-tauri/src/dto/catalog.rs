use super::DownloadOptionDto;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCatalogPayload {
  pub query: String,
  pub include_steam: Option<bool>,
  pub only_with_sources: Option<bool>,
  pub offset: Option<usize>,
  pub limit: Option<usize>,
  pub attach_covers: Option<bool>,
  pub local_only: Option<bool>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct EmbeddedCatalogEntry {
  pub title: String,
  pub genre: String,
  pub steam_app_id: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CatalogGameDto {
  pub id: String,
  pub title: String,
  pub genre: String,
  pub cover_url: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub local_cover_path: Option<String>,
  pub source: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub option_count: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub group_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetGameDetailPayload {
  pub group_key: Option<String>,
  pub title: Option<String>,
  pub include_steam: Option<bool>,
  pub language: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameDetailDto {
  pub game: CatalogGameDto,
  pub synopsis: Option<String>,
  pub screenshots: Vec<String>,
  pub trailer_url: Option<String>,
  pub trailer_thumbnail: Option<String>,
  pub steam_app_id: Option<u32>,
  pub downloads: Vec<DownloadOptionDto>,
  pub in_library: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveGenresBatchPayload { pub titles: Vec<String> }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedGenreDto {
  pub title: String,
  pub genre: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogChangeDto {
  pub source_id: String,
  pub source_name: String,
  pub new_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedCoverBatchItem {
  pub title: String,
  pub cover_url: Option<String>,
  pub local_cover_path: Option<String>,
}
