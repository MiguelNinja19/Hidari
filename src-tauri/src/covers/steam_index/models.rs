use serde::Deserialize;
use std::time::Duration;

#[derive(Deserialize)]
pub(crate) struct MirrorAppEntry {
  pub(crate) appid: u32,
  pub(crate) name: String,
}

#[derive(Deserialize)]
pub(crate) struct StoreAppListResponse {
  pub(crate) response: StoreAppListInner,
}

#[derive(Deserialize)]
pub(crate) struct StoreAppListInner {
  #[serde(default)]
  pub(crate) apps: Vec<StoreAppEntry>,
  #[serde(default)]
  pub(crate) have_more_results: bool,
  #[serde(default)]
  pub(crate) last_appid: u32,
}

#[derive(Deserialize)]
pub(crate) struct StoreAppEntry {
  pub(crate) appid: u32,
  #[serde(alias = "app_name")]
  pub(crate) name: String,
}

pub(crate) fn is_noise_app_name(name: &str) -> bool {
  let name = name.to_lowercase();
  let markers = [
    "soundtrack", "dedicated server", "sdk", "beta test", "playtest",
    "artbook", "art book", "demo", "trailer", " ost", "benchmark",
  ];
  name.trim().is_empty() || markers.iter().any(|marker| name.contains(marker))
}

pub(crate) fn steam_http_client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .timeout(Duration::from_secs(120))
    .user_agent("Hidari/1.0")
    .build()
    .map_err(|error| format!("could_not_create_steam_index_client: {error}"))
}
