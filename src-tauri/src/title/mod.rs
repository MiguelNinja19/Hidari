mod base;
mod colon;
mod cover;
mod display;
mod group_key;
mod noise;
mod normalize;
mod regex;
mod search;

pub use cover::{cover_storage_key, cover_title_key_candidates};
pub use display::catalog_game_display_title_from_group_key;
pub use group_key::{canonical_catalog_group_key, catalog_game_group_key};
pub use normalize::{
  clean_title_for_matching, normalize_title_key, simplify_source_search_query, tokenize_title,
};
pub use search::catalog_search_group_keys_equivalent;

#[cfg(test)]
mod tests;
