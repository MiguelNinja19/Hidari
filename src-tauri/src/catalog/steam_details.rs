use crate::covers::lookup_steam_app_id_local;
use crate::db::open_database_connection;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const CACHE_TTL: Duration = Duration::from_secs(7 * 24 * 60 * 60);
const STEAM_STORE_LOCALE: &str = "brazilian";

fn default_steam_locale() -> String {
  String::new()
}

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
struct SteamAppDetailsResponse {
  success: bool,
  data: Option<SteamAppDetailsData>,
}

#[derive(Debug, Clone, Deserialize)]
struct SteamGenre {
  description: String,
}

#[derive(Debug, Clone, Deserialize)]
struct SteamAppDetailsData {
  short_description: Option<String>,
  header_image: Option<String>,
  screenshots: Option<Vec<SteamScreenshot>>,
  movies: Option<Vec<SteamMovie>>,
  genres: Option<Vec<SteamGenre>>,
}

#[derive(Debug, Clone, Deserialize)]
struct SteamScreenshot {
  path_full: String,
}

#[derive(Debug, Clone, Deserialize)]
struct SteamMovie {
  thumbnail: Option<String>,
  mp4: Option<SteamMovieFormats>,
  webm: Option<SteamMovieFormats>,
}

#[derive(Debug, Clone, Deserialize)]
struct SteamMovieFormats {
  #[serde(rename = "480")]
  size_480: Option<String>,
  max: Option<String>,
}

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

pub async fn fetch_steam_game_details(app_id: u32) -> Option<SteamGameDetails> {
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(12))
    .build()
    .ok()?;
  let url = format!(
    "https://store.steampowered.com/api/appdetails?appids={app_id}&l={STEAM_STORE_LOCALE}"
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
  let data = parsed.data?;
  let (trailer_url, trailer_thumbnail) = data
    .movies
    .as_ref()
    .and_then(|movies| movies.first())
    .map(extract_trailer)
    .unwrap_or((None, None));
  Some(SteamGameDetails {
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
    locale: STEAM_STORE_LOCALE.to_string(),
    genres: data
      .genres
      .unwrap_or_default()
      .into_iter()
      .map(|genre| genre.description.trim().to_string())
      .filter(|genre| !genre.is_empty())
      .take(4)
      .collect(),
  })
}

pub fn read_cached_steam_details(conn: &Connection, app_id: u32) -> Option<SteamGameDetails> {
  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .ok()?
    .as_secs() as i64;
  let (json, updated_at): (String, i64) = conn
    .query_row(
      "SELECT payload_json, updated_at FROM steam_game_details WHERE app_id = ?1",
      params![app_id],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .ok()?;
  if now - updated_at > CACHE_TTL.as_secs() as i64 {
    return None;
  }
  let details: SteamGameDetails = serde_json::from_str(&json).ok()?;
  if details.locale != STEAM_STORE_LOCALE {
    return None;
  }
  Some(details)
}

pub fn write_cached_steam_details(conn: &Connection, details: &SteamGameDetails) {
  let Ok(json) = serde_json::to_string(details) else {
    return;
  };
  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs() as i64)
    .unwrap_or(0);
  let _ = conn.execute(
    "INSERT INTO steam_game_details (app_id, payload_json, updated_at) \
     VALUES (?1, ?2, ?3) \
     ON CONFLICT(app_id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at",
    params![details.app_id, json, now],
  );
}

pub fn cached_genres_for_title(conn: &Connection, title: &str) -> Option<Vec<String>> {
  let app_id = crate::covers::lookup_steam_app_id_local(conn, title).map(|(id, _)| id)?;
  let details = read_cached_steam_details(conn, app_id)?;
  if details.genres.is_empty() {
    return None;
  }
  Some(details.genres)
}

pub async fn resolve_steam_details_for_app(
  app: &tauri::AppHandle,
  title: &str,
) -> Option<SteamGameDetails> {
  let conn = open_database_connection(app).ok()?;
  let app_id = lookup_steam_app_id_local(&conn, title).map(|(id, _)| id)?;
  if let Some(cached) = read_cached_steam_details(&conn, app_id) {
    return Some(cached);
  }
  drop(conn);
  let details = fetch_steam_game_details(app_id).await?;
  if let Ok(conn) = open_database_connection(app) {
    write_cached_steam_details(&conn, &details);
  }
  Some(details)
}
