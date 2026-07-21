use crate::dto::DownloadOptionDto;
use crate::title::catalog_game_group_key;

pub(crate) fn filter_options_for_group_key(
  options: Vec<DownloadOptionDto>,
  group_key: &str,
) -> Vec<DownloadOptionDto> {
  let group_key = group_key.trim();
  if group_key.is_empty() {
    return options;
  }
  let query_canon = crate::title::canonical_catalog_group_key(group_key);
  options
    .into_iter()
    .filter(|option| {
      let option_key = catalog_game_group_key(&option.title);
      let option_canon = crate::title::canonical_catalog_group_key(&option_key);
      option_key == group_key
        || option_canon == query_canon
        || crate::title::catalog_search_group_keys_equivalent(&option_canon, &query_canon)
        || crate::title::catalog_search_group_keys_equivalent(&query_canon, &option_canon)
    })
    .collect()
}
