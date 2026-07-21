use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDefaultDownloadPathPayload { pub path: String }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSeedTorrentsEnabledPayload { pub enabled: bool }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAppSettingPayload { pub key: String }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAppSettingPayload {
  pub key: String,
  pub value: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskPathPayload { pub path: String }

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct SourceEntry {
  pub id: i64,
  pub name: String,
  pub base_url: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceOptionItem {
  pub title: Option<String>,
  pub url: String,
  #[serde(alias = "download_type")]
  pub download_type: Option<String>,
  pub quality: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct SourceSearchResponse { pub options: Vec<SourceOptionItem> }

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydraChangesResponseItem {
  pub shop: String,
  pub object_id: String,
  pub new_download_options_count: i64,
}
