use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameCoverDto {
  pub title_key: String,
  pub cover_url: String,
  pub local_path: Option<String>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SteamAppIndexStatusDto {
  pub total_apps: usize,
  pub last_updated_at: Option<i64>,
  pub refreshing: bool,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CoverPrecacheStatusDto {
  pub running: bool,
  pub total: usize,
  pub processed: usize,
  pub cached: usize,
  pub downloaded: usize,
  pub unresolved: usize,
  pub failed: usize,
}
