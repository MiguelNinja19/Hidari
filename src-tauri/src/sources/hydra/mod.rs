mod catalogue_api;
mod client;
mod download_search;
mod game_candidate;
mod game_search;
mod models;
mod options;
mod source;
mod store;

use super::hydralinks::{
  display_name_for_source_url, resolve_source_display_name,
};
use super::hydralinks;

pub use catalogue_api::hydra_game_download_sources;
pub(crate) use catalogue_api::hydra_catalogue_search;
pub(crate) use client::{api_base_url, api_http_error};
pub use client::{
  hydra_http_client, hydra_refresh_download_source_meta, is_catalog_content_fingerprint,
};
pub use download_search::search_download_options_via_api;
pub(crate) use game_candidate::resolve_game_candidate;
pub use game_search::search_catalog_games_via_api;
pub(crate) use models::{HydraCatalogueGame, HydraCatalogueSearchResponse};
pub use models::{HydraApiDownloadSource, HydraGameRepack};
pub(crate) use options::{
  api_source_context, persist_options, repack_to_download_options,
};
pub use source::{create_hydra_source, create_hydra_source_from_remote};
pub use store::{
  count_hydra_catalog_entries, ensure_default_hydra_sources, get_hydra_source_by_id,
  list_hydra_sources, persist_hydra_api_meta, persist_hydra_source_display_name,
  upsert_hydra_source,
};
