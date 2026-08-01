//! Parse Steam `appmanifest_<appid>.acf` files.
//!
//! ACF format is Valve's VDF textual format:
//! ```
//! "AppState"
//! {
//!   "appid"     "123456"
//!   "name"      "Game Name"
//!   "installdir"  "GameFolderName"
//!   "SizeOnDisk"  "12345678901"
//!   ...
//! }
//! ```
//! We implement a minimal tokenizer — no external VDF crate needed.

use super::AppManifest;
use std::collections::HashMap;
use std::path::Path;

/// Parse an ACF file content into a flat key->value map (top-level only).
/// Returns an empty map on parse failure.
pub fn parse_acf_content(content: &str) -> HashMap<String, String> {
  let mut result = HashMap::new();
  let mut chars = content.chars().peekable();
  let mut depth = 0;
  let mut last_key: Option<String> = None;

  while let Some(c) = chars.next() {
    if c.is_whitespace() {
      continue;
    }
    if c == '{' {
      depth += 1;
      last_key = None;
      continue;
    }
    if c == '}' {
      if depth > 0 {
        depth -= 1;
      }
      last_key = None;
      continue;
    }
    if c == '"' {
      // Read a quoted string
      let mut s = String::new();
      while let Some(c2) = chars.next() {
        if c2 == '"' {
          break;
        }
        if c2 == '\\' {
          if let Some(esc) = chars.next() {
            s.push(esc);
          }
        } else {
          s.push(c2);
        }
      }
      // If we have a last_key at depth 1, this is a value
      if depth == 1 {
        if let Some(k) = last_key.take() {
          result.insert(k, s);
        } else {
          // This is a key, save for next iteration
          last_key = Some(s);
        }
      }
    }
  }
  result
}

/// Parse an ACF file from disk, returning an AppManifest.
pub fn parse_acf_file(
  path: &Path,
  library_folder: &str,
) -> Result<AppManifest, String> {
  let content = std::fs::read_to_string(path)
    .map_err(|e| format!("read acf {}: {e}", path.display()))?;
  let map = parse_acf_content(&content);

  let appid = map.get("appid").cloned().unwrap_or_default();
  let name = map.get("name").cloned().unwrap_or_default();
  let installdir = map.get("installdir").cloned().unwrap_or_default();
  let size_on_disk: u64 = map
    .get("SizeOnDisk")
    .and_then(|s| s.parse().ok())
    .unwrap_or(0);
  let last_updated: i64 = map
    .get("LastUpdated")
    .and_then(|s| s.parse().ok())
    .unwrap_or(0);
  let buildid = map.get("buildid").cloned().unwrap_or_default();

  // Compute absolute install path
  let install_path = std::path::Path::new(library_folder)
    .join("steamapps")
    .join("common")
    .join(&installdir)
    .to_string_lossy()
    .to_string();

  Ok(AppManifest {
    appid,
    name,
    installdir,
    size_on_disk,
    last_updated,
    buildid,
    install_path,
    library_folder: library_folder.to_string(),
  })
}
