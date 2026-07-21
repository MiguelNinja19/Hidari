use super::types::FileFingerprint;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn file_fingerprint(path: &Path) -> Option<FileFingerprint> {
  let meta = std::fs::metadata(path).ok()?;
  let modified_ms = meta
    .modified()
    .ok()?
    .duration_since(UNIX_EPOCH)
    .ok()?
    .as_millis();
  Some(FileFingerprint {
    path: path.to_path_buf(),
    modified_ms,
    len: meta.len(),
  })
}
pub(crate) fn now_unix_ms() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis() as i64)
    .unwrap_or(0)
}
pub(crate) fn payload_hash(body: &str) -> String {
  let mut hasher = DefaultHasher::new();
  body.hash(&mut hasher);
  format!("{:x}", hasher.finish())
}
