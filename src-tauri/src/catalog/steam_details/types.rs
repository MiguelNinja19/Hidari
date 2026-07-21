use super::locale::default_steam_locale;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamGameDetails {
  pub app_id: u32,
  pub synopsis: Option<String>,
  pub header_image: Option<String>,
  pub screenshots: Vec<String>,
  pub trailer_url: Option<String>,
  pub trailer_thumbnail: Option<String>,
  #[serde(default = "default_steam_locale")]
  pub locale: String,
  #[serde(default)]
  pub genres: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SteamAppDetailsResponse {
  pub(crate) success: bool,
  pub(crate) data: Option<SteamAppDetailsData>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SteamGenre {
  pub(crate) description: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SteamAppDetailsData {
  pub(crate) short_description: Option<String>,
  pub(crate) header_image: Option<String>,
  pub(crate) screenshots: Option<Vec<SteamScreenshot>>,
  pub(crate) movies: Option<Vec<SteamMovie>>,
  pub(crate) genres: Option<Vec<SteamGenre>>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SteamScreenshot {
  pub(crate) path_full: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SteamMovie {
  pub(crate) thumbnail: Option<String>,
  pub(crate) mp4: Option<SteamMovieFormats>,
  pub(crate) webm: Option<SteamMovieFormats>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SteamMovieFormats {
  #[serde(rename = "480")]
  pub(crate) size_480: Option<String>,
  pub(crate) max: Option<String>,
}
