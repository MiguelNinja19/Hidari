mod engine;
mod extraction;
mod commands;
mod failover;

pub use commands::{
  emit_deep_link_event, open_deep_link, open_local_path, queue_deep_link_event,
  remove_job_from_library, sidecar_cancel_job, sidecar_enqueue_job, sidecar_launch_job,
  sidecar_list_jobs, sidecar_open_job_folder, sidecar_pause_job, sidecar_resume_job,
  sidecar_status, take_pending_deep_link,
};
pub use engine::{
  ensure_sidecar_running, graceful_app_quit,
  spawn_download_engine, spawn_sidecar_progress_watcher,
};
pub use extraction::{
  emit_extract_status, extract_job_archive, process_job_extraction, process_job_post_download,
  spawn_extraction_watcher,
};
