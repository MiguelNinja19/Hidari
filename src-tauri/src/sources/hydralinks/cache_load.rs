use super::paths_local::resolve_local_catalog_path;
use super::cache_index::index_catalog;
use super::cache_memory::{memory_cache, read_memory_cache_arc, read_memory_cache_if_fresh};
use super::parse::read_catalog_file;
use super::db_read::read_catalog_from_db;
use super::types::{CachedCatalog, MemoryCacheEntry};
use super::util::file_fingerprint;
use crate::dto::HydraSourceDto;
use tauri::AppHandle;

pub fn load_cached_catalog_for_source(
  app: &AppHandle,
  source: &HydraSourceDto,
) -> Option<std::sync::Arc<CachedCatalog>> {
  let path = resolve_local_catalog_path(&source.url);
  let fingerprint = path.as_ref().and_then(|p| file_fingerprint(p));

  if let Some(cached) = read_memory_cache_if_fresh(&source.id, fingerprint.as_ref()) {
    return Some(cached);
  }

  if let Some(path) = path.as_ref() {
    if let Ok((catalog, _)) = read_catalog_file(path) {
      let fp = fingerprint.or_else(|| file_fingerprint(path));
      let indexed = index_catalog(catalog, fp);
      let arc = std::sync::Arc::new(indexed);
      if let Ok(mut cache) = memory_cache().lock() {
        cache.insert(
          source.id.clone(),
          MemoryCacheEntry {
            catalog: arc.clone(),
          },
        );
      }
      return Some(arc);
    }
  }

  if let Some(cached) = read_memory_cache_arc(&source.id) {
    return Some(cached);
  }

  let catalog = read_catalog_from_db(app, &source.id)?;
  let indexed = index_catalog(catalog, None);
  let arc = std::sync::Arc::new(indexed);
  if let Ok(mut cache) = memory_cache().lock() {
    cache.insert(
      source.id.clone(),
      MemoryCacheEntry {
        catalog: arc.clone(),
      },
    );
  }
  Some(arc)
}
