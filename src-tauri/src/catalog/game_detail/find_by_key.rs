use crate::catalog::stable_embedded_id;
use crate::dto::{CatalogGameDto, HydraSourceDto};
use crate::sources::load_cached_catalog_for_source;
use crate::title::catalog_game_display_title_from_group_key;
use tauri::AppHandle;

pub(crate) fn find_catalog_game_by_group_key(
  app: &AppHandle,
  sources: &[HydraSourceDto],
  group_key: &str,
) -> Option<CatalogGameDto> {
  let group_key = group_key.trim();
  if group_key.is_empty() {
    return None;
  }

  let mut option_count = 0usize;
  let mut source_name = String::from("Catálogo");
  let mut found = false;
  let query_canon = crate::title::canonical_catalog_group_key(group_key);

  for source in sources {
    let Some(catalog) = load_cached_catalog_for_source(app, source) else {
      continue;
    };
    for download in &catalog.downloads {
      let download_canon = crate::title::canonical_catalog_group_key(&download.group_key);
      let matches = download.group_key == group_key
        || download_canon == query_canon
        || crate::title::catalog_search_group_keys_equivalent(&download_canon, &query_canon)
        || crate::title::catalog_search_group_keys_equivalent(&query_canon, &download_canon);
      if !matches {
        continue;
      }
      found = true;
      option_count += 1;
      if source_name == "Catálogo" {
        source_name = catalog
          .name
          .as_ref()
          .map(|name| name.trim().to_string())
          .filter(|name| !name.is_empty())
          .unwrap_or_else(|| source.name.clone());
      }
    }
  }

  if !found {
    return Some(CatalogGameDto {
      id: format!("source:{}", stable_embedded_id(group_key)),
      title: catalog_game_display_title_from_group_key(group_key),
      genre: source_name,
      cover_url: None,
      local_cover_path: None,
      source: "source".to_string(),
      option_count: None,
      group_key: Some(group_key.to_string()),
    });
  }

  Some(CatalogGameDto {
    id: format!("source:{}", stable_embedded_id(group_key)),
    title: catalog_game_display_title_from_group_key(group_key),
    genre: source_name,
    cover_url: None,
    local_cover_path: None,
    source: "source".to_string(),
    option_count: (option_count > 1).then_some(option_count as u32),
    group_key: Some(group_key.to_string()),
  })
}
