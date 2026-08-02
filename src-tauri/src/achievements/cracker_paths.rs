//! Path patterns for each cracker's save file location.
//!
//! Returns candidate paths for a given (cracker, object_id) pair.
//! On Linux/Wine, paths are mirrored under `drive_c/users/<user>/...`
//! inside the Wine prefix.

use super::Cracker;
use std::path::PathBuf;

/// Known environment variable placeholders used in cracker path patterns.
fn resolve_env_var(name: &str) -> Option<PathBuf> {
  match name {
    "APPDATA" => std::env::var("APPDATA").ok().map(PathBuf::from),
    "PUBLICDOCS" => {
      // On Windows: %PUBLIC%\Documents
      // On Wine prefix: <prefix>/drive_c/users/Public/Documents
      if cfg!(target_os = "windows") {
        std::env::var("PUBLIC").ok().map(|p| PathBuf::from(p).join("Documents"))
      } else {
        None
      }
    }
    "USERPROFILE" => std::env::var("USERPROFILE").ok().map(PathBuf::from),
    "PROGRAMDATA" => std::env::var("PROGRAMDATA").ok().map(PathBuf::from),
    _ => None,
  }
}

/// Get the user profile path inside a Wine prefix (for Linux/macOS).
fn wine_user_profile(wine_prefix: &std::path::Path) -> Option<PathBuf> {
  // Try to read user.reg to find the actual user name
  let user_reg = wine_prefix.join("user.reg");
  if std::fs::read_to_string(&user_reg).is_ok() {
    // The actual username in Wine defaults to the Linux username.
    // For simplicity, just use the Linux username.
    let user = std::env::var("USER").unwrap_or_else(|_| "steamuser".to_string());
    Some(wine_prefix.join("drive_c/users").join(&user))
  } else {
    // Fallback: assume default wine user
    Some(wine_prefix.join("drive_c/users/steamuser"))
  }
}

/// Resolve a Windows-style path pattern like "%APPDATA%/Steam/CODEX/<id>/achievements.ini"
/// to actual filesystem paths.
fn resolve_pattern(pattern: &str, object_id: &str) -> Vec<PathBuf> {
  let mut path = PathBuf::new();
  let mut current_var = String::new();
  let mut in_var = false;
  let mut chars = pattern.chars().peekable();

  while let Some(c) = chars.next() {
    if c == '%' {
      if in_var {
        // End of variable
        if let Some(resolved) = resolve_env_var(&current_var) {
          path = resolved;
        }
        current_var.clear();
        in_var = false;
      } else {
        in_var = true;
      }
    } else if in_var {
      current_var.push(c);
    } else if c == '/' {
      path.push(&current_var[..0]); // noop, just to use the variable
      // Start a new component
      // (path separator, will be handled by next push)
    } else {
      // Accumulate as a path component
      // We'll handle this after the loop
      current_var.push(c);
    }
  }

  // Simplified approach: just substitute %VAR%/rest with the env var + rest
  let mut results = Vec::new();
  if pattern.starts_with('%') {
    if let Some(end) = pattern.find('%').and_then(|i| {
      if i == 0 {
        pattern[1..].find('%').map(|j| j + 1)
      } else {
        None
      }
    }) {
      let var_name = &pattern[1..end];
      let rest = &pattern[end + 1..].trim_start_matches('/');
      if let Some(base) = resolve_env_var(var_name) {
        // Substitute object_id placeholder
        let rest = rest.replace("<id>", object_id);
        results.push(base.join(rest));
      }
    }
  } else if pattern.starts_with("<steamPath>") || pattern.starts_with("<prefix>") {
    // Skip — these require runtime resolution
    // (handled separately in get_paths_for_cracker)
  } else {
    // Direct path
    let p = pattern.replace("<id>", object_id);
    results.push(PathBuf::from(p));
  }

  results
}

/// Get candidate paths for a cracker's achievement file for a given game.
///
/// On Linux, callers should also pass a `wine_prefix` so that Windows paths
/// are mirrored under `drive_c/users/<user>/...`.
pub fn get_paths_for_cracker(
  cracker: Cracker,
  object_id: &str,
  steam_path: Option<&std::path::Path>,
  wine_prefix: Option<&std::path::Path>,
) -> Vec<PathBuf> {
  let patterns = patterns_for_cracker(cracker);
  let mut paths = Vec::new();

  for p in patterns {
    if p.starts_with("<steamPath>") && steam_path.is_some() {
      let steam = steam_path.unwrap();
      let rest = p.trim_start_matches("<steamPath>").trim_start_matches('/');
      let rest = rest.replace("<id>", object_id);
      let path = steam.join(&rest);
      paths.push(path.clone());
      // Also try under userdata/<userId>/config/librarycache/<id>.json
    }

    if p.starts_with('%') {
      // Windows env var pattern
      paths.extend(resolve_pattern(&p, object_id));

      // On Linux/macOS with Wine prefix, mirror under drive_c/users/<user>
      if let Some(prefix) = wine_prefix {
        if let Some(user_profile) = wine_user_profile(prefix) {
          let mirrored = mirror_windows_path(&p, object_id, &user_profile);
          if let Some(m) = mirrored {
            paths.push(m);
          }
        }
      }
    }
  }

  paths
}

/// Convert a Windows pattern like "%APPDATA%/Steam/CODEX/<id>/achievements.ini"
/// to the equivalent Wine prefix path: "<prefix>/drive_c/users/<user>/AppData/Roaming/Steam/CODEX/<id>/achievements.ini"
fn mirror_windows_path(pattern: &str, object_id: &str, user_profile: &std::path::Path) -> Option<PathBuf> {
  // Map Windows env vars to Wine paths
  let (env_name, rest) = if pattern.starts_with("%APPDATA%") {
    ("APPDATA", pattern.trim_start_matches("%APPDATA%").trim_start_matches('/'))
  } else if pattern.starts_with("%USERPROFILE%") {
    ("USERPROFILE", pattern.trim_start_matches("%USERPROFILE%").trim_start_matches('/'))
  } else if pattern.starts_with("%PUBLICDOCS%") {
    // PUBLICDOCS = <prefix>/drive_c/users/Public/Documents
    let rest = pattern.trim_start_matches("%PUBLICDOCS%").trim_start_matches('/');
    let rest = rest.replace("<id>", object_id);
    return Some(
      user_profile
        .parent()
        .unwrap_or(user_profile)
        .join("Public/Documents")
        .join(rest),
    );
  } else if pattern.starts_with("%PROGRAMDATA%") {
    // PROGRAMDATA = <prefix>/drive_c/ProgramData
    let rest = pattern.trim_start_matches("%PROGRAMDATA%").trim_start_matches('/');
    let rest = rest.replace("<id>", object_id);
    return Some(
      user_profile
        .parent()
        .unwrap_or(user_profile)
        .parent()
        .unwrap_or(user_profile)
        .join("drive_c/ProgramData")
        .join(rest),
    );
  } else {
    return None;
  };

  let rest = rest.replace("<id>", object_id);

  match env_name {
    "APPDATA" => Some(user_profile.join("AppData/Roaming").join(rest)),
    "USERPROFILE" => Some(user_profile.join(rest)),
    _ => None,
  }
}

/// All path patterns for a given cracker. Uses `<id>` placeholder for object_id,
/// `%ENV_VAR%` for Windows env vars, and `<steamPath>` for the Steam install path.
fn patterns_for_cracker(cracker: Cracker) -> Vec<&'static str> {
  match cracker {
    Cracker::Codex => vec![
      "%PUBLICDOCS%/Steam/CODEX/<id>/achievements.ini",
      "%APPDATA%/Steam/CODEX/<id>/achievements.ini",
    ],
    Cracker::Goldberg => vec![
      "%APPDATA%/Goldberg SteamEmu Saves/<id>/achievements.json",
      "%APPDATA%/GSE Saves/<id>/achievements.json",
    ],
    Cracker::Rune => vec![
      "%PUBLICDOCS%/Steam/RUNE/<id>/achievements.ini",
    ],
    Cracker::OnlineFix => vec![
      "%APPDATA%/OnlineFix/<id>/achievements.ini",
    ],
    Cracker::Skidrow => vec![
      "%USERPROFILE%/Documents/SKIDROW/<id>/SteamEmu/UserStats/achiev.ini",
    ],
    Cracker::Rld => vec![
      "%PROGRAMDATA%/Steam/Player/<id>/stats/achievements.ini",
      "%PROGRAMDATA%/Steam/Player/DODI/<id>/stats/achievements.ini",
    ],
    Cracker::Empress => vec![
      "%APPDATA%/Empress/<id>/achievements.json",
    ],
    Cracker::ThreeDM => vec![
      "%APPDATA%/Steam3DM/<id>/stats.bin",
    ],
    Cracker::Flt => vec![
      "%PUBLICDOCS%/Steam/FLT/<id>/",
    ],
    Cracker::Razor1911 => vec![
      "%PUBLICDOCS%/Steam/Razor1911/<id>/stats.txt",
    ],
    Cracker::CreamApi => vec![
      "%APPDATA%/CreamAPI/<id>/stats.ini",
    ],
    Cracker::SmartSteamEmu => vec![
      "%APPDATA%/SmartSteamEmu/<id>/achievements.ini",
    ],
    Cracker::Steam => vec![
      "<steamPath>/userdata/<userId>/config/librarycache/<id>.json",
    ],
  }
}
