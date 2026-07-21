pub mod hydra;
pub mod hydralinks;

pub use hydra::*;
pub use hydralinks::*;

mod magnet;
mod search_local;
mod validate;

pub use magnet::{enrich_magnet_url, enrich_magnet_url_with_title};
pub use search_local::search_download_options_from_local_sources;
pub use validate::{validate_job_url, validate_source_url};
