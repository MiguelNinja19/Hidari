use crate::dto::{APP_EVENT_DEEP_LINK, DeepLinkEventPayload};
use tauri::{AppHandle, Emitter};
use url::Url;

#[tauri::command]
pub fn open_deep_link(app: AppHandle, url: String) -> Result<(), String> {
  emit_deep_link_event(&app, &url)?;
  Ok(())
}

pub fn emit_deep_link_event(app: &AppHandle, url: &str) -> Result<(), String> {
  let parsed = Url::parse(url).map_err(|error| format!("invalid_deep_link: {error}"))?;
  let action = Some(parsed.path().trim_start_matches('/').to_string()).filter(|value| !value.is_empty());
  let mut game_id = None;
  let mut search_query = None;
  let mut group_key = None;
  let mut title = None;
  for (key, value) in parsed.query_pairs() {
    match key.as_ref() {
      "gameId" => game_id = Some(value.to_string()),
      "q" => search_query = Some(value.to_string()),
      "groupKey" => group_key = Some(value.to_string()),
      "title" => title = Some(value.to_string()),
      _ => {}
    }
  }

  app
    .emit(
      APP_EVENT_DEEP_LINK,
      DeepLinkEventPayload {
        url: url.to_string(),
        game_id,
        action,
        search_query,
        group_key,
        title,
      },
    )
    .map_err(|error| format!("could_not_emit_deep_link_event: {error}"))
}
