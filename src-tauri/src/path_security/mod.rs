mod core;
mod legacy;
mod policy;
mod roots;

pub use legacy::migrate_legacy_app_data;
pub use policy::{
  validate_download_root_setting, validate_enqueue_dest_path, validate_existing_directory,
  validate_managed_path,
};
pub use core::validate_absolute_user_path;

#[cfg(test)]
mod tests;
