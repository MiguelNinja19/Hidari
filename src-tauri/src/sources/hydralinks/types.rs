use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub(crate) const MAX_TITLES_PER_SOURCE: usize = 32;

#[derive(Debug, Clone)]
pub(crate) struct FileFingerprint {
  pub path: PathBuf,
  pub modified_ms: u128,
  pub len: u64,
}

#[derive(Debug, Clone)]
pub struct IndexedDownload {
  pub title: String,
  pub title_norm: String,
  pub group_key: String,
  pub file_size: Option<String>,
  pub uris: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct CachedCatalog {
  pub name: Option<String>,
  pub downloads: Vec<IndexedDownload>,
  pub(crate) prefix_index: std::collections::HashMap<String, Vec<usize>>,
  pub(crate) fingerprint: Option<FileFingerprint>,
}

pub(crate) struct MemoryCacheEntry {
  pub catalog: std::sync::Arc<CachedCatalog>,
}

#[derive(Debug, Clone)]
pub struct CatalogTitleHit {
  pub title: String,
  pub _source_name: String,
  pub group_key: String,
  pub option_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydraLinksCatalog {
  pub name: Option<String>,
  pub downloads: Vec<HydraLinksDownload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydraLinksDownload {
  #[serde(default)]
  pub title: String,
  #[serde(default, alias = "file_size")]
  pub file_size: Option<String>,
  #[serde(default, deserialize_with = "super::parse::deserialize_uris_flexible")]
  pub uris: Vec<String>,
  #[serde(default, alias = "upload_date")]
  pub upload_date: Option<String>,
}

pub enum SyncCatalogOutcome {
  Updated(usize),
  Unchanged(usize),
  OfflineOnly { count: usize, warning: String },
}

pub struct StagedLocalCatalogImport {
  pub cache_path: String,
  pub body: String,
  pub catalog: HydraLinksCatalog,
  pub count: usize,
}
