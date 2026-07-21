use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddDownloadSourcePayload { pub url: String }

#[derive(Debug, Deserialize)]
pub struct RemoveHydraSourcePayload { pub id: String }

#[derive(Debug, Deserialize)]
pub struct SyncLocalSourcePayload { pub id: String }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncLocalSourceResultDto {
  pub source_id: String,
  pub download_count: usize,
  pub warning: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncLocalSourceFailureDto {
  pub source_id: String,
  pub source_name: String,
  pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncAllLocalSourcesResultDto {
  pub synced: Vec<SyncLocalSourceResultDto>,
  pub failures: Vec<SyncLocalSourceFailureDto>,
  pub unchanged_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HydraSourceDto {
  pub id: String,
  pub name: String,
  pub url: String,
  pub status: String,
  pub download_count: i64,
  pub fingerprint: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub api_source_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub remote_url: Option<String>,
  pub created_at: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct TestSourcePayload { pub id: i64 }

#[allow(dead_code)]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestSourceResultDto {
  pub source_id: i64,
  pub ok: bool,
  pub status_code: Option<u16>,
  pub latency_ms: u128,
  pub message: String,
}

#[allow(dead_code)]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSourceChangeDto {
  pub game_id: i64,
  pub new_download_options_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOptionDto {
  pub source_id: String,
  pub source_name: String,
  pub title: String,
  pub download_type: String,
  pub url: String,
  pub quality: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub cover_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchDownloadOptionsPayload {
  pub query: String,
  pub group_key: Option<String>,
}
