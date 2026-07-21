mod commands;
mod download;
mod files;
mod lookup;
mod precache;
mod repair;
mod steam_index;
mod store;

pub use commands::{
  ensure_game_cover_cached, invalidate_game_cover_local, list_game_covers,
  resolve_game_cover_url, save_game_cover,
};
pub use download::{cover_download_urls, download_and_cache_cover};
pub(crate) use files::covers_dir_for_app;
pub use files::{
  is_plausible_cover_url, is_plausible_local_cover_path, is_usable_cover_file,
  is_valid_cover_bytes, remove_cover_file,
};
pub use lookup::lookup_cover_row_for_title;
pub use precache::{
  attach_cover_urls_to_games, bulk_resolve_catalog_covers_from_index, get_cover_cache_stats,
  get_cover_precache_status, resolve_cover_url, resolve_covers_for_titles,
  retry_unresolved_covers, start_cover_precache, stop_cover_precache, CoverPrecacheState,
};
pub use repair::{repair_corrupt_cover_paths, repair_corrupt_cover_urls};
pub use steam_index::{
  get_steam_app_index_status, lookup_steam_app_id_local, maybe_refresh_steam_app_index,
  refresh_steam_app_index,
};
pub use store::{
  clear_cover_precache_skips, count_active_cover_skips, mark_cover_resolve_skip,
  should_skip_cover_resolve, upsert_game_cover, upsert_game_cover_if_absent,
};
