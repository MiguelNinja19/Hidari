use super::{is_noise_app_name, steam_http_client, MirrorAppEntry, StoreAppListResponse};
use crate::config::{
  STEAM_GAMES_APPID_MIRROR_URL, STEAM_STORE_APP_LIST_URL, STEAM_WEB_API_KEY_ENV,
};

async fn fetch_store(key: &str) -> Result<Vec<(u32, String)>, String> {
  let client = steam_http_client()?;
  let mut output = Vec::new();
  let mut last_appid = 0u32;
  loop {
    let response = client
      .get(STEAM_STORE_APP_LIST_URL)
      .query(&[
        ("key", key.to_string()),
        ("include_games", "true".to_string()),
        ("include_dlc", "false".to_string()),
        ("include_software", "false".to_string()),
        ("include_videos", "false".to_string()),
        ("include_hardware", "false".to_string()),
        ("max_results", "50000".to_string()),
        ("last_appid", last_appid.to_string()),
      ])
      .send()
      .await
      .map_err(|error| format!("steam_store_app_list_request_failed: {error}"))?;
    if !response.status().is_success() {
      return Err(format!("steam_store_app_list_http_{}", response.status()));
    }
    let payload: StoreAppListResponse = response
      .json().await
      .map_err(|error| format!("steam_store_app_list_parse_failed: {error}"))?;
    let page_len = payload.response.apps.len();
    output.extend(
      payload.response.apps.into_iter()
        .filter(|entry| !is_noise_app_name(&entry.name))
        .map(|entry| (entry.appid, entry.name)),
    );
    if !payload.response.have_more_results || page_len == 0 {
      break;
    }
    last_appid = payload.response.last_appid;
    if last_appid == 0 {
      break;
    }
  }
  (!output.is_empty()).then_some(output)
    .ok_or_else(|| "steam_store_app_list_empty".to_string())
}

async fn fetch_mirror() -> Result<Vec<(u32, String)>, String> {
  let response = steam_http_client()?
    .get(STEAM_GAMES_APPID_MIRROR_URL)
    .send().await
    .map_err(|error| format!("steam_app_list_mirror_request_failed: {error}"))?;
  if !response.status().is_success() {
    return Err(format!("steam_app_list_mirror_http_{}", response.status()));
  }
  let entries: Vec<MirrorAppEntry> = response.json().await
    .map_err(|error| format!("steam_app_list_mirror_parse_failed: {error}"))?;
  let apps = entries.into_iter()
    .filter(|entry| !is_noise_app_name(&entry.name))
    .map(|entry| (entry.appid, entry.name))
    .collect::<Vec<_>>();
  (!apps.is_empty()).then_some(apps)
    .ok_or_else(|| "steam_app_list_mirror_empty".to_string())
}

pub(crate) async fn fetch_steam_app_list() -> Result<Vec<(u32, String)>, String> {
  let key = std::env::var(STEAM_WEB_API_KEY_ENV)
    .ok().map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());
  if let Some(key) = key {
    if let Ok(apps) = fetch_store(&key).await {
      return Ok(apps);
    }
  }
  fetch_mirror().await
}
