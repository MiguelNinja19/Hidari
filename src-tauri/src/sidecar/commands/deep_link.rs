use crate::dto::{APP_EVENT_DEEP_LINK, DeepLinkEventPayload};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use url::Url;

static PENDING_DEEP_LINK: Mutex<Option<DeepLinkEventPayload>> = Mutex::new(None);

#[tauri::command]
pub fn open_deep_link(app: AppHandle, url: String) -> Result<(), String> {
  emit_deep_link_event(&app, &url)?;
  Ok(())
}

#[tauri::command]
pub fn take_pending_deep_link() -> Option<DeepLinkEventPayload> {
  PENDING_DEEP_LINK.lock().ok().and_then(|mut guard| guard.take())
}

fn deep_link_action(parsed: &Url) -> Option<String> {
  let from_path = parsed.path().trim_start_matches('/').trim();
  if !from_path.is_empty() {
    return Some(from_path.to_string());
  }
  // `hidari://launch?...` coloca "launch" no host, não no path.
  parsed
    .host_str()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(str::to_string)
}

fn parse_deep_link_payload(url: &str) -> Result<DeepLinkEventPayload, String> {
  let parsed = Url::parse(url).map_err(|error| format!("invalid_deep_link: {error}"))?;
  let action = deep_link_action(&parsed);
  let mut game_id = None;
  let mut search_query = None;
  let mut group_key = None;
  let mut title = None;
  let mut path = None;
  for (key, value) in parsed.query_pairs() {
    match key.as_ref() {
      "gameId" => game_id = Some(value.to_string()),
      "q" => search_query = Some(value.to_string()),
      "groupKey" => group_key = Some(value.to_string()),
      "title" => title = Some(value.to_string()),
      "path" | "destPath" => path = Some(value.to_string()),
      _ => {}
    }
  }
  Ok(DeepLinkEventPayload {
    url: url.to_string(),
    game_id,
    action,
    search_query,
    group_key,
    title,
    path,
  })
}

fn store_pending(payload: &DeepLinkEventPayload) {
  if let Ok(mut guard) = PENDING_DEEP_LINK.lock() {
    *guard = Some(payload.clone());
  }
}

/// Guarda o deep link sem emitir (arranque a frio — UI ainda não está a ouvir).
pub fn queue_deep_link_event(url: &str) -> Result<(), String> {
  let payload = parse_deep_link_payload(url)?;
  store_pending(&payload);
  Ok(())
}

pub fn emit_deep_link_event(app: &AppHandle, url: &str) -> Result<(), String> {
  let payload = parse_deep_link_payload(url)?;
  store_pending(&payload);
  crate::app::window::show_main_window(app);
  app
    .emit(APP_EVENT_DEEP_LINK, payload)
    .map_err(|error| format!("could_not_emit_deep_link_event: {error}"))
}
