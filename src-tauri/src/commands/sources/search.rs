use crate::db::{get_disabled_hydra_source_ids_from_conn, open_database_connection};
use crate::dto::{DownloadOptionDto, HydraSourceDto, SearchDownloadOptionsPayload};
use crate::sources::{
  list_download_options_for_group_key, list_hydra_sources, search_download_options_from_local_sources,
};
use crate::title::catalog_game_group_key;
use tauri::AppHandle;

#[tauri::command]
pub async fn search_download_options(
  app: AppHandle,
  payload: SearchDownloadOptionsPayload,
) -> Result<Vec<DownloadOptionDto>, String> {
  let query = payload.query.trim();

  let conn = open_database_connection(&app)?;
  let hydra_sources = list_hydra_sources(&conn)?;
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn)?;
  drop(conn);

  let active_sources: Vec<HydraSourceDto> = hydra_sources
    .into_iter()
    .filter(|source| !disabled.contains(&source.id))
    .collect();

  if active_sources.is_empty() {
    return Ok(Vec::new());
  }

  let group_key = payload
    .group_key
    .as_ref()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());

  if let Some(ref group_key) = group_key {
    let by_key = list_download_options_for_group_key(&app, &active_sources, group_key);
    if !by_key.is_empty() {
      return Ok(by_key);
    }
  }

  if query.len() < 2 {
    if let Some(ref group_key) = group_key {
      return Ok(list_download_options_for_group_key(&app, &active_sources, group_key));
    }
    return Ok(Vec::new());
  }

  let options =
    search_download_options_from_local_sources(&app, query, &active_sources).await;

  if let Some(ref group_key) = group_key {
    let filtered: Vec<DownloadOptionDto> = options
      .into_iter()
      .filter(|option| catalog_game_group_key(&option.title) == *group_key)
      .collect();
    if !filtered.is_empty() {
      return Ok(filtered);
    }
    return Ok(list_download_options_for_group_key(&app, &active_sources, group_key));
  }

  Ok(options)
}
