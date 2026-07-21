mod actions;
mod events;
mod extract;
mod jobs;
mod overlay;
mod post_download;
mod seven_zip;
mod watcher;
mod watcher_job;

pub use actions::{
  finalize_job_if_playable, run_after_install_action, verify_download_payload,
};
pub use events::emit_extract_status;
pub(crate) use events::{emit_continue_progress, request_continue_torrent_content};
pub use extract::{extract_job_archive, process_job_extraction};
pub use jobs::list_sidecar_jobs_for_watcher;
pub(crate) use jobs::{
  dest_has_game_content_async, job_reported_metadata_only,
};
pub use overlay::enrich_jobs_with_extraction;
pub use post_download::process_job_post_download;
pub use seven_zip::{resolve_7z_path, run_7z_extract};
pub use watcher::spawn_extraction_watcher;
pub(crate) use watcher_job::start_job_if_ready;
