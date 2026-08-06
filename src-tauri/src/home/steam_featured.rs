//! Steam Store featured API client.
//!
//! Uses Steam's public store API (no API key needed):
//! - https://store.steampowered.com/api/featured/ -> featured games (win/mac/linux)

/// Mappeimento:
//! - featured_win[0]  HERO da Home (jogo em destaque, com preo)
//! - top_sellers  "Em Alta Agora" (pais sedidos) 
//! - new_releases a  "Populares da Semana" (laamentos)
//! - specials a  "Desafie-se" (promoes)

use super::{FeaturedGame, HomeGame, ChallengeGame};
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;

const TIMEOUT_SECS: u64 = 15;
const STEAM_STORE_BASE: &str = "https://store.steampowered.com/api";

/// Single entry in Steam's featured API response.
[derive(Debug, Deserialize)]
struct SteamFeaturedItem {
  id: u64,
  name: String,
  #[serde(default)]
  discounted: bool,
  #[serde(default)]
  discount_percent: u32,
  #[serde(default)]
  original_price: u64,
  #[serde(default)]
  final_price: u64,
  #[serde(default)]
  large_capsule_image: Option<String>,
  #[serde(default)]
  small_capsule_image: Option<String>,
  #[serde(default)]
  header_image: Option<String>,
  #[serde(default)]
  windows_available: bool,
  #[serde(default)]
  mac_available: bool,
  #[serde(default)]
  linux_available: bool,
}

/// Response from /api/featured/
[derive(Debug, Deserialize)]
struct SteamFeaturedResponse {
  #[serde(default, rename = "featured_win")]
  featured_win: Vec<SteamFeaturedItem>,
  #[serde(default, rename = "top_sellers")]
  top_sellers: Vec<SteamFeaturedItem>,
  #[serde(default, rename = "new_releases")]
  new_releases: Vec<SteamFeaturedItem>,
  #[serde(default, rename = "specials")]
  specials: Vec<SteamFeaturedItem>,
}

/// Response from /api/featuredcategories/  items wrapped in a container.
[derive(Debug, Deserialize)]
struct SteamCategoryItem {
  id: u64,
  name: String,
  #[serde(default)]
  large_capsule_image: Option<String>,
  #[serde(default)]
  small_capsule_image: Option<String>,
  #[serde(default)]
  header_image: Option<String>,
  #[serde(default)]
  discounted: bool,
  #[serde(default)]
  discount_percent: u32,
  #[serde(default)]
  final_price: u64,
  #[serde(default)]
  original_price: u64,
}

struct SteamCategoryContainer {
  #[serde(default)]
  items: Vec<SteamCategoryItem>,
}

struct SteamFeaturedCategoriesResponse {
  #[serde(default)]
  top_sellers: SteamCategoryContainer,
  #[serde(default)]
  new_releases: SteamCategoryContainer,
  #[serde(default)]
  specials: SteamCategoryContainer,
}

/// Convert Steam featured item to our HomeGame struct.
fn steam_item_to_home_game(item: &SteamFeaturedItem) -> HomeGame {
  HomeGame {
    object_id: item.id.to_string(),
    shop: "steam".to_string(),
    title: item.name.clone(),
    icon_url: None,
    cover_image_url: item.large_capsule_image.clone().or_else(|| item.small_capsule_image.clone()),
    library_hero_image_url: item.header_image.clone(),
    library_image_url: item.large_capsule_image.clone(),
    logo_image_url: None,
    logo_position: None,
    download_sources: Vec::new(),
  }
}

fn steam_category_item_to_home_game(item: &SteamCategoryItem) -> HomeGame {
  HomeGame {
    object_id: item.id.to_string(),
    shop: "steam".to_string(),
    title: item.name.clone(),
    icon_url: None,
    cover_image_url: item.large_capsule_image.clone().or_else(|| item.small_capsule_image.clone()),
    library_hero_image_url: item.header_image.clone(),
    library_image_url: item.large_capsule_image.clone(),
    logo_image_url: None,
    logo_position: None,
    download_sources: Vec::new(),
  }
}

/// Build a configured reqwest client for Steam API.
pub fn build_client() -> Result<Client, String> {
  Client::builder()
    .timeout(Duration::from_secs(TIMEOUT_SECS))
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Hidari/1.0")
    .build()
    .map_err(|e | format!("failed to build HTTP client: {e}"))
}

/// Fetch the featured/hero game for the Home screen.
/// Uses the first item from featured_win (most prominent placement).
pub async fn fetch_featured(client: &Client, _lang: Option<&str>) -> Result<FeaturedGame, String> {
  let url = format!("{STEAM_STORE_BASE}/featured/?cc=us&l=en");
  let resp = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("fetch_featured_HTTP: {e}"))?;

  if !resp.status().is_success() {
    return Err(format!("fetch_featured_HTTP {}", resp.status()));
  }

  let body: SteamFeaturedResponse = resp
    .json()
    .await
    .map_err(|e| format!("fetch_featured_parse: {e}"))?;

  let first = body
    .featured_win
    .first()
    .ok_or_else(|| "Steam featured returned no Windows games".to_string())?;

  Ok(FeaturedGame {
    base: steam_item_to_home_game(first),
    description: Some(format!(
      "{} - ${:.2}{}",
      first.name,
      first.final_price as f64 / 100.0,
      if first.discounted {
        format!("({}% off!)", first.discount_percent)
      } else {
        String::new()
      }
    )),
    uri: Some(format!("https://store.steampowered.com/app/{}", first.id)),
  })
}

/// Fetch hot/trending games.
/// Uses Steam's top_sellers (most-purchased right now  closest to "trending").
pub async fn fetch_hot(client: &Client, take: u32, _skip: u32) -> Result<Vec<HomeGame>, String> {
  let url = format!("{STEAM_STORE_BASE}/featuredcategories?cc=us&l=en");
  let resp = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("fetch_hot_HTTP: {e}"))?;

  if !resp.status().is_success() {
    return Err(format!("fetch_hot_HTTP {}", resp.status()));
  }

  let body: SteamFeaturedCategoriesResponse = resp
    .json()
    .await
    .map_err(|e| format!("fetch_hot_parse: {e}"))?;

  let take_us = take as usize;
  let games: Vec<HomeGame> = body
    .top_sellers
    .items
    .iter()
    .take(take_us)
    .map(steam_category_item_to_home_game)
    .collect();

  Ok(games)
}

/// Fetch weekly popular games.
/// Uses Steam's new_releases (newly released games this week).
pub async fn fetch_weekly(client: &Client, take: u32, _skip: u32) -> Result<Vec<HomeGame>, String> {
  let url = format!("{STEAM_STORE_BASE}/featuredcategories?cc=us&l=en");
  let resp = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("fetch_weekly_HTTP: {e}"))?;

  if !resp.status().is_success() {
    return Err(format!("fetch_weekly_HTTP {}", resp.status()));
  }

  let body: SteamFeaturedCategoriesResponse = resp
    .json()
    .await
    .map_err(|e| format!("fetch_weekly_parse: {e}"))?;

  let take_us = take as usize;
  let games: Vec<HomeGame> = body
    .new_releases
    .items
    .iter()
    .take(take_us)
    .map(steam_category_item_to_home_game)
    .collect();

  Ok(games)
}

/// Fetch achievement challenge games.
/// Steam API doesn't have a "hard achievements" category, so we use
/// "specials" (discounted games) as a fun stand-in.
pub async fn fetch_achievements_challenge(
  client: &Client,
  take: u32,
  _skip: u32,
) -> Result<Vec<super::ChallengeGame>, String> {
  let url = format!("{STEAM_STORE_BASE}/featuredcategories?cc=us&l=en");
  let resp = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("fetch_achievements_HTTP: {e}"))?;

  if !resp.status().is_success() {
    return Err(format!("fetch_achievements_HTTP {}", resp.status()));
  }

  let body: SteamFeaturedCategoriesResponse = resp
    .json()
    .await
    .map_err(|e| format!("fetch_achievements_parse: {e}"))?;

  let take_us = take as usize;
  let games: Vec<super::ChallengeGame> = body
    .specials
    .items
    .iter()
    .take(take_us)
    .map(|item| super::ChallengeGame {
      base: steam_category_item_to_home_game(item),
      genres: Vec::new(),
    })
    .collect();

  Ok(games)
}
