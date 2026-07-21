use super::filter::filter_options_for_group_key;
use crate::catalog::title_matches_query;
use crate::dto::{CatalogGameDto, DownloadOptionDto, HydraSourceDto};
use crate::sources::{
  list_download_options_for_group_key, search_download_options_from_local_sources,
};
use tauri::AppHandle;

pub async fn resolve_downloads(
  app: &AppHandle,
  game: &CatalogGameDto,
  active_sources: &[HydraSourceDto],
  group_key: Option<&str>,
) -> Vec<DownloadOptionDto> {
  if let Some(group_key) = group_key {
    let options = list_download_options_for_group_key(app, active_sources, group_key);
    if !options.is_empty() {
      return options;
    }
    let searched =
      search_download_options_from_local_sources(app, &game.title, active_sources).await;
    let filtered = filter_options_for_group_key(searched.clone(), group_key);
    if !filtered.is_empty() {
      return filtered;
    }
    return searched
      .into_iter()
      .filter(|option| title_matches_query(&option.title, &game.title))
      .collect();
  }
  search_download_options_from_local_sources(app, &game.title, active_sources).await
}
