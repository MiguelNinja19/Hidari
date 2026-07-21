use super::cache::{read_cached_steam_details, write_cached_steam_details};
use super::fetch::fetch_steam_game_details;
use super::locale::resolve_steam_locale;
use super::types::SteamGameDetails;
use crate::covers::lookup_steam_app_id_local;
use crate::db::open_database_connection;

pub async fn resolve_steam_details_for_app(
  app: &tauri::AppHandle,
  title: &str,
  language: Option<&str>,
) -> Option<SteamGameDetails> {
  let conn = open_database_connection(app).ok()?;
  let locale = resolve_steam_locale(&conn, language);
  let app_id = lookup_steam_app_id_local(&conn, title).map(|(id, _)| id)?;
  if let Some(cached) = read_cached_steam_details(&conn, app_id, &locale) {
    return Some(cached);
  }
  drop(conn);
  let details = fetch_steam_game_details(app_id, &locale).await?;
  if let Ok(conn) = open_database_connection(app) {
    write_cached_steam_details(&conn, &details);
  }
  Some(details)
}
