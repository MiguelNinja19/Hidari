use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchGamePayload {
  pub title: String,
  pub path: String,
  pub job_id: Option<String>,
  #[serde(default)]
  pub preferred_setup: Option<String>,
  #[serde(default)]
  pub preferred_exe: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectLibraryPathEntry {
  pub key: String,
  pub title: String,
  pub path: String,
  pub job_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectLibraryPathsPayload { pub entries: Vec<InspectLibraryPathEntry> }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectLibraryPathResultItem {
  pub key: String,
  pub state: LibraryPathStateDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLibraryGameRootPayload {
  pub title: String,
  pub dest_path: String,
  pub game_root: String,
  pub job_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddExternalLibraryGamePayload {
  pub path: String,
  #[serde(default)]
  pub title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLibraryLaunchExePayload {
  pub title: String,
  pub dest_path: String,
  pub exe_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryNotePayload {
  pub path: String,
  pub title: String,
  pub note: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPathStateDto {
  pub has_game: bool,
  pub needs_install: bool,
  pub install_path: Option<String>,
  pub needs_extraction: bool,
  pub playable: bool,
  pub custom_game_root: Option<String>,
  pub launch_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteCatalogEntryDto {
  pub catalog_key: String,
  pub title: String,
  pub added_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleFavoritePayload {
  pub title: String,
  pub catalog_key: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPlayStatDto {
  pub path_key: String,
  pub last_played_at: Option<String>,
  pub play_count: i64,
}
