//! HTTP client for Hydra Cloud catalogue endpoints.

use super::{FeaturedGame, HomeGame, ChallengeGame, DEFAULT_HYDRA_API_URL};
use reqwest::Client;
use std::time::Duration;

const TIMEOUT_SECS: u64 = 15;
const DEFAULT_LANG: &str = "en";
const DEFAULT_TAKE: u32 = 24;

/// Build a configured reqwest client for Hydra API.
pub fn build_client() -> Result<Client, String> {
  Client::builder()
    .timeout(Duration::from_secs(TIMEOUT_SECS))
    .user_agent(concat!("Hidari/", env!("CARGO_PKG_VERSION")))
    .build()
    .map_err(|e| format!("failed to build HTTP client: {e}"))
}

/// Resolve the Hydra API base URL. Reads from env, falls back to default.
fn api_base() -> String {
  std::env::var("HIDARI_HYDRA_API_URL").unwrap_or_else(|_| DEFAULT_HYDRA_API_URL.to_string())
}

/// Fetch the featured/hero game.
pub async fn fetch_featured(client: &Client, lang: Option<&str>) -> Result<FeaturedGame, String> {
  let language = lang.unwrap_or(DEFAULT_LANG);
  let url = format!("{}/catalogue/featured?language={}", api_base(), language);
  let resp = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("fetch_featured: {e}"))?
    .error_for_status()
    .map_err(|e| format!("fetch_featured status: {e}"))?;
  resp
    .json::<FeaturedGame>()
    .await
    .map_err(|e| format!("fetch_featured parse: {e}"))
}

/// Fetch hot games (trending right now).
pub async fn fetch_hot(client: &Client, take: u32, skip: u32) -> Result<Vec<HomeGame>, String> {
  let take = if take == 0 { DEFAULT_TAKE } else { take };
  let url = format!("{}/catalogue/hot?take={}&skip={}", api_base(), take, skip);
  let resp = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("fetch_hot: {e}"))?
    .error_for_status()
    .map_err(|e| format!("fetch_hot status: {e}"))?;
  resp
    .json::<Vec<HomeGame>>()
    .await
    .map_err(|e| format!("fetch_hot parse: {e}"))
}

/// Fetch weekly games (popular this week).
pub async fn fetch_weekly(client: &Client, take: u32, skip: u32) -> Result<Vec<HomeGame>, String> {
  let take = if take == 0 { DEFAULT_TAKE } else { take };
  let url = format!("{}/catalogue/weekly?take={}&skip={}", api_base(), take, skip);
  let resp = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("fetch_weekly: {e}"))?
    .error_for_status()
    .map_err(|e| format!("fetch_weekly status: {e}"))?;
  resp
    .json::<Vec<HomeGame>>()
    .await
    .map_err(|e| format!("fetch_weekly parse: {e}"))
}

/// Fetch achievement challenge games (hard platinums).
pub async fn fetch_achievements_challenge(
  client: &Client,
  take: u32,
  skip: u32,
) -> Result<Vec<ChallengeGame>, String> {
  let take = if take == 0 { 12 } else { take };
  let url = format!("{}/catalogue/achievements?take={}&skip={}", api_base(), take, skip);
  let resp = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("fetch_achievements: {e}"))?
    .error_for_status()
    .map_err(|e| format!("fetch_achievements status: {e}"))?;
  resp
    .json::<Vec<ChallengeGame>>()
    .await
    .map_err(|e| format!("fetch_achievements parse: {e}"))
}
