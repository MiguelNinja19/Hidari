mod sources;
mod system;

pub use sources::*;
pub use system::*;

pub use crate::catalog::search_game_catalog;
pub use crate::covers::{
  ensure_game_cover_cached,   get_cover_cache_stats, get_cover_precache_status,
  invalidate_game_cover_local, list_game_covers, resolve_covers_for_titles, resolve_game_cover_url,
  save_game_cover,
  start_cover_precache, stop_cover_precache, retry_unresolved_covers,
  get_steam_app_index_status, refresh_steam_app_index,
};
pub use crate::library::{
  delete_local_library_item, extract_library_folder, inspect_library_path,
  inspect_library_paths, launch_game_from_path, launch_setup_from_path, scan_default_download_path,
  set_library_game_root,
};
pub use crate::queue::clear_completed_jobs;
pub use crate::sidecar::{
  extract_job_archive, open_deep_link, open_local_path, remove_job_from_library, sidecar_cancel_job,
  sidecar_enqueue_job, sidecar_launch_job, sidecar_list_jobs, sidecar_open_job_folder,
  sidecar_pause_job, sidecar_resume_job, sidecar_status,
};
