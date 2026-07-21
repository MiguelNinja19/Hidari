mod attach;
mod batch;
mod commands;
mod queries;
mod resolve;
mod state;
mod worker;
mod worker_item;

pub use attach::attach_cover_urls_to_games;
pub use batch::resolve_covers_for_titles;
pub use commands::{
  get_cover_cache_stats, get_cover_precache_status, retry_unresolved_covers,
  start_cover_precache, stop_cover_precache,
};
pub use queries::{count_cached_covers, count_catalog_titles};
pub(crate) use queries::titles_pending_precache;
pub use resolve::{
  bulk_resolve_catalog_covers_from_index, resolve_cover_url, resolve_cover_url_local,
};
pub use state::{CoverPrecacheSnapshot, CoverPrecacheState};
pub use worker::{maybe_start_cover_precache, spawn_cover_precache};
pub(crate) use worker_item::{process_title, Outcome};

pub fn now_unix_secs() -> i64 {
  use std::time::{SystemTime, UNIX_EPOCH};
  i64::try_from(
    SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap_or_default()
      .as_secs(),
  )
  .unwrap_or(0)
}
