//! Home screen backend - multi-API game data source.
//!
//! PRIMARY source: Steam Store featured API (public, no auth, reliable)
//!   - https://store.steampowered.com/api/featured/
//!   - https://store.steampowered.com/api/featuredcategories/
//!
//! FALLBACK source: Hydra Cloud API (catalogue endpoints)
//!   - Only used if Steam fails (e.g. region-blocked)
//!
//! Caches responses in SQLite for 30 minutes to reduce network usage.

pub mod steam_featured;
pub mod hydra_catalogue;
pub mod cache;
pub mod commands;

use serde::{Deserialize, Serialize};

/// A game entry returned by the Hydra catalogue endpoints.
/// Mirrors `ShopAssets` in the Hydra codebase (src/types/).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeGame {
  pub object_id: String,
  pub shop: String,
  pub title: String,
  #[serde(default)]
  pub icon_url: Option<String>,
  #[serde(default)]
  pub cover_image_url: Option<String>,
  #[serde(default)]
  pub library_hero_image_url: Option<String>,
  #[serde(default)]
  pub library_image_url: Option<String>,
  #[serde(default)]
  pub logo_image_url: Option<String>,
  #[serde(default)]
  pub logo_position: Option<String>,
  #[serde(default)]
  pub download_sources: Vec<String>,
}

/// Featured/hero game with extended metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeaturedGame {
  #[serde(flatten)]
  pub base: HomeGame,
  #[serde(default)]
  pub description: Option<String>,
  #[serde(default)]
  pub uri: Option<String>,
}

/// Game with genre info (for achievements challenge section).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChallengeGame {
  #[serde(flatten)]
  pub base: HomeGame,
  #[serde(default)]
  pub genres: Vec<String>,
}

/// Hydra Cloud API base URL. Can be overridden via env var.
pub fn hydra_api_url() -> String {
  std::env::var("HIDARI_HYDRA_API_URL").unwrap_or_else(|_| {
    "https://api.hydra.issues".to_string() // placeholder, replaced by config
  })
}

/// Default Hydra Cloud API URL (public, no auth needed for catalogue endpoints).
pub const DEFAULT_HYDRA_API_URL: &str = "https://catalogue.hydracdn.cloud";

/// Tauri-managed state holding a shared reqwest client (cheap to clone).
/// We build it once at app startup and reuse for all Home requests.
pub struct HomeClientState {
  pub client: reqwest::Client,
}

impl Default for HomeClientState {
  fn default() -> Self {
    let client = reqwest::Client::builder()
      .timeout(std::time::Duration::from_secs(15))
      .user_agent(concat!("Hidari/", env!("CARGO_PKG_VERSION")))
      .build()
      .unwrap_or_else(|_| reqwest::Client::new());
    Self { client }
  }
}
