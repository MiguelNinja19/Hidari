//! Parse `libraryfolders.vdf` to discover all Steam library folders.
//!
//! Steam allows users to install games on multiple drives. Each library
//! folder is listed in `<steam_path>/steamapps/libraryfolders.vdf`:
//! ```
//! "libraryfolders"
//! {
//!   "0"  "C:\\Program Files (x86)\\Steam"
//!   "1"  "D:\\SteamLibrary"
//!   "2"  "E:\\Games\\Steam"
//! }
//! ```

use std::path::Path;

/// Parse libraryfolders.vdf and return the list of library paths.
pub fn parse_library_folders(steam_path: &Path) -> Vec<String> {
  let vdf_path = steam_path.join("steamapps").join("libraryfolders.vdf");
  let content = match std::fs::read_to_string(&vdf_path) {
    Ok(c) => c,
    Err(_) => {
      // Fallback: just use the steam_path itself
      return vec![steam_path.to_string_lossy().to_string()];
    }
  };

  // Reuse the same ACF parser since VDF format is identical
  // But libraryfolders.vdf has nested structure, so we need a different approach
  let mut folders = Vec::new();
  let mut chars = content.chars().peekable();
  let mut in_string = false;
  let mut current = String::new();
  let mut strings: Vec<String> = Vec::new();

  while let Some(c) = chars.next() {
    if in_string {
      if c == '"' {
        strings.push(std::mem::take(&mut current));
        in_string = false;
      } else if c == '\\' {
        if let Some(esc) = chars.next() {
          current.push(esc);
        }
      } else {
        current.push(c);
      }
    } else if c == '"' {
      in_string = true;
    }
  }

  // Strings at odd positions (index 1, 3, 5, ...) inside the nested structure
  // are paths (the even positions are the index keys "0", "1", "2", ...)
  // But we also have "path", "label", "contentid" keys...
  // Strategy: collect strings that look like paths (start with letter or /, contain separators)
  for s in &strings {
    // Skip numeric-only strings (index keys)
    if s.chars().all(|c| c.is_ascii_digit()) {
      continue;
    }
    // Skip known non-path keys
    if matches!(s.as_str(), "path" | "label" | "contentid" | "libraryfolders") {
      continue;
    }
    // Skip if it doesn't look like a path
    if !s.contains('/') && !s.contains('\\') {
      continue;
    }
    // Normalize: replace forward slashes with the platform separator (already correct on Linux)
    folders.push(s.clone());
  }

  // Deduplicate
  folders.sort();
  folders.dedup();

  // Always include the steam_path itself as the first library
  let steam_root = steam_path.to_string_lossy().to_string();
  if !folders.contains(&steam_root) {
    folders.insert(0, steam_root);
  }

  folders
}
