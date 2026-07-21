pub mod catalog_changes;
pub mod game_detail;
pub mod steam_details;

mod embedded;
mod genres;
mod matching;
mod merge;
mod search_command;
mod source_search;
mod steam_cache;
mod steam_cover;
mod steam_search;

pub use catalog_changes::{check_catalog_changes, record_catalog_snapshot};
pub use embedded::*;
pub use game_detail::get_game_detail;
pub(crate) use genres::looks_like_source_label;
pub use genres::resolve_game_genres_batch;
pub use matching::*;
pub(crate) use merge::merge_local_and_api_catalog;
pub use search_command::search_game_catalog;
pub use source_search::search_catalog_from_sources;
pub use steam_cache::{steam_cache_get, steam_cache_put};
pub use steam_cover::fetch_steam_cover_url_for_title;
pub use steam_search::{
  fetch_steam_catalog_games, score_steam_title_match, steam_search_queries_for_title,
};

#[cfg(test)]
mod matching_tests;
