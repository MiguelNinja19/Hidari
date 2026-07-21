use super::cache_index::{catalog_from_cached, index_catalog};
use super::types::{CachedCatalog, FileFingerprint, HydraLinksCatalog, MemoryCacheEntry};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

pub(crate) fn memory_cache() -> &'static Mutex<HashMap<String, MemoryCacheEntry>> {
  static CACHE: OnceLock<Mutex<HashMap<String, MemoryCacheEntry>>> = OnceLock::new();
  CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}
fn remember_cached(source_id: &str, catalog: CachedCatalog) {
  if let Ok(mut cache) = memory_cache().lock() {
    cache.insert(
      source_id.to_string(),
      MemoryCacheEntry {
        catalog: std::sync::Arc::new(catalog),
      },
    );
  }
}

pub(crate) fn remember_in_memory(source_id: &str, catalog: HydraLinksCatalog) {
  remember_cached(source_id, index_catalog(catalog, None));
}

pub(crate) fn read_memory_cache_arc(source_id: &str) -> Option<std::sync::Arc<CachedCatalog>> {
  let cache = memory_cache().lock().ok()?;
  cache.get(source_id).map(|entry| entry.catalog.clone())
}

pub(crate) fn read_memory_cache(source_id: &str) -> Option<HydraLinksCatalog> {
  let cached = read_memory_cache_arc(source_id)?;
  Some(catalog_from_cached(&cached))
}

pub(crate) fn read_memory_cache_if_fresh(
  source_id: &str,
  fingerprint: Option<&FileFingerprint>,
) -> Option<std::sync::Arc<CachedCatalog>> {
  let cached = read_memory_cache_arc(source_id)?;
  match (fingerprint, cached.fingerprint.as_ref()) {
    (Some(expected), Some(actual))
      if expected.path == actual.path
        && expected.modified_ms == actual.modified_ms
        && expected.len == actual.len =>
    {
      Some(cached)
    }
    (None, None) => Some(cached),
    // Sem ficheiro no disco: cache em memória ainda serve (payload DB / API).
    (None, Some(_)) => Some(cached),
    _ => None,
  }
}
