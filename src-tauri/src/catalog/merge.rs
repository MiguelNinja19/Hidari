use crate::dto::CatalogGameDto;
use std::collections::HashSet;

fn dedupe_key(game: &CatalogGameDto) -> String {
  if let Some(group_key) = game
    .group_key
    .as_ref()
    .map(|value| value.trim())
    .filter(|value| !value.is_empty())
  {
    return crate::title::canonical_catalog_group_key(group_key);
  }
  crate::title::catalog_game_group_key(&game.title)
}

pub(crate) fn merge_local_and_api_catalog(
  local: Vec<CatalogGameDto>,
  api: Vec<CatalogGameDto>,
  need: usize,
) -> Vec<CatalogGameDto> {
  let mut seen = HashSet::new();
  let local_unique: Vec<_> = local
    .into_iter()
    .filter(|game| {
      let key = dedupe_key(game);
      !key.is_empty() && seen.insert(key)
    })
    .collect();
  let mut api_unique = Vec::new();
  for mut game in api {
    if game.group_key.as_deref().is_none_or(|key| key.trim().is_empty()) {
      let key = crate::title::catalog_game_group_key(&game.title);
      if !key.is_empty() {
        game.group_key = Some(key);
      }
    }
    let key = dedupe_key(&game);
    if !key.is_empty() && seen.insert(key) {
      api_unique.push(game);
    }
  }
  if local_unique.len() >= need && !api_unique.is_empty() {
    let reserve = ((need + 2) / 3)
      .max(4)
      .min(api_unique.len())
      .min(need.saturating_sub(1).max(1));
    let mut out: Vec<_> = local_unique
      .into_iter()
      .take(need.saturating_sub(reserve))
      .collect();
    out.extend(api_unique.into_iter().take(reserve));
    return out;
  }
  let mut out = local_unique;
  out.extend(api_unique);
  out.truncate(need);
  out
}
