mod append;
mod cache_index;
mod cache_load;
mod cache_memory;
mod db_delete_file;
mod db_entries;
mod db_read;
mod db_write;
mod fetch;
mod import_local;
mod names;
mod parse;
mod paths;
mod paths_local;
mod paths_resolve;
mod patterns;
mod presence;
mod search_group;
mod search_options;
mod search_titles;
mod source_resolve;
mod sync;
mod sync_apply;
mod sync_import;
mod types;
mod uri;
mod url_detect;
mod util;
mod warm;

#[cfg(test)]
mod tests_parse;
#[cfg(test)]
mod tests_misc;

pub use append::append_catalog_download_options;
pub use cache_load::load_cached_catalog_for_source;
pub use db_delete_file::delete_source_catalog_json_file;
pub use db_write::delete_source_catalog;
pub use import_local::{
  finalize_local_catalog_import, migrate_external_catalog_to_cache_if_needed,
  stage_local_catalog_for_import,
};

pub use names::{
  display_name_for_source_url, resolve_source_display_name,
};
pub use paths::{
  catalog_cache_dir, catalog_cache_path_for_remote_url, hydralinks_remote_url_for_local_path,
};
pub use search_group::list_download_options_for_group_key;
pub use search_options::search_json_catalog_source;
pub use search_titles::search_distinct_catalog_titles_from_json;
pub use source_resolve::is_syncable_catalog_source;
pub use sync::sync_source_catalog_from_remote;
pub use sync_import::import_source_catalog_from_remote_url;
pub use types::SyncCatalogOutcome;
pub use url_detect::{
  is_local_catalog_path, is_remote_catalog_url, normalize_remote_catalog_url,
};
pub use presence::has_local_catalog;
pub use warm::warm_local_catalog_caches;
