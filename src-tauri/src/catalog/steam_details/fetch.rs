use super::types::{SteamAppDetailsData, SteamAppDetailsResponse, SteamGameDetails, SteamMovie, SteamMovieFormats};
use std::time::Duration;

fn pick_movie_url(formats: &SteamMovieFormats) -> Option<String> {
  formats.max.clone().or_else(|| formats.size_480.clone())
}

fn extract_trailer(movie: &SteamMovie) -> (Option<String>, Option<String>) {
  let url = movie
    .mp4
    .as_ref()
    .and_then(pick_movie_url)
    .or_else(|| movie.webm.as_ref().and_then(pick_movie_url));
  (url, movie.thumbnail.clone())
}

fn build_details(data: SteamAppDetailsData, app_id: u32, locale: &str) -> SteamGameDetails {
  let (trailer_url, trailer_thumbnail) = data
    .movies
    .as_ref()
    .and_then(|movies| movies.first())
    .map(extract_trailer)
    .unwrap_or((None, None));
  SteamGameDetails {
    app_id,
    synopsis: data.short_description.filter(|s| !s.trim().is_empty()),
    header_image: data.header_image,
    screenshots: data
      .screenshots
      .unwrap_or_default()
      .into_iter()
      .map(|s| s.path_full)
      .take(6)
      .collect(),
    trailer_url,
    trailer_thumbnail,
    locale: locale.to_string(),
    genres: data
      .genres
      .unwrap_or_default()
      .into_iter()
      .map(|genre| genre.description.trim().to_string())
      .filter(|genre| !genre.is_empty())
      .take(4)
      .collect(),
  }
}

pub async fn fetch_steam_game_details(app_id: u32, locale: &str) -> Option<SteamGameDetails> {
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(12))
    .build()
    .ok()?;
  let url = format!(
    "https://store.steampowered.com/api/appdetails?appids={app_id}&l={locale}"
  );
  let response = client.get(&url).send().await.ok()?;
  if !response.status().is_success() {
    return None;
  }
  let body: serde_json::Value = response.json().await.ok()?;
  let entry = body.get(app_id.to_string())?;
  let parsed: SteamAppDetailsResponse = serde_json::from_value(entry.clone()).ok()?;
  if !parsed.success {
    return None;
  }
  Some(build_details(parsed.data?, app_id, locale))
}
