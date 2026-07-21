use super::{hydra_game_download_sources, repack_to_download_options, HydraCatalogueGame};
use crate::dto::{CatalogGameDto, DownloadOptionDto, HydraSourceDto};
use std::collections::HashMap;

pub(crate) async fn resolve_game_candidate(
  game: HydraCatalogueGame,
  api_ids: Vec<String>,
  sources: HashMap<String, HydraSourceDto>,
) -> Option<(CatalogGameDto, Vec<DownloadOptionDto>)> {
  let repacks = hydra_game_download_sources(&game.shop, &game.object_id, &api_ids)
    .await
    .map_err(|error| {
      eprintln!("hydra_game_download_sources_failed: {} — {error}", game.title);
    })
    .ok()?;
  let options: Vec<_> = repacks
    .iter()
    .filter(|repack| {
      !repack.uris.is_empty()
        && api_ids.iter().any(|id| id == &repack.download_source_id)
    })
    .flat_map(|repack| repack_to_download_options(repack, &sources))
    .collect();
  if options.is_empty() {
    return None;
  }
  let group_key = crate::title::catalog_game_group_key(&game.title);
  let dto = CatalogGameDto {
    id: format!("hydra:{}:{}", game.shop, game.object_id),
    title: game.title,
    genre: String::new(),
    cover_url: game.library_image_url,
    local_cover_path: None,
    source: "hydra_api".to_string(),
    option_count: (options.len() > 1).then_some(options.len() as u32),
    group_key: (!group_key.is_empty()).then_some(group_key),
  };
  Some((dto, options))
}
