pub const HYDRA_API_URL: &str = "https://api.hydralauncher.gg";
pub const FITGIRL_SITE_URL: &str = "https://fitgirl-repacks.site";
pub const STEAM_STORE_SEARCH_URL: &str =
  "https://store.steampowered.com/api/storesearch/";

pub const DOWNLOAD_ENGINE_BINARY: &str = "download-engine.exe";
pub const ARIA2_BINARY: &str = "aria2c.exe";
pub const SEVEN_ZIP_BINARY: &str = "7z.exe";

pub fn download_engine_binary_name() -> &'static str {
  if cfg!(target_os = "windows") {
    DOWNLOAD_ENGINE_BINARY
  } else {
    "download-engine"
  }
}

pub const DEFAULT_MAGNET_TRACKERS: &[&str] = &[
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealer.cc:1337/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://tracker.tiny-vps.com:6969/announce",
];

pub fn steam_library_cover_urls(app_id: &str) -> Vec<String> {
  vec![
    format!(
      "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_600x900.jpg"
    ),
    format!(
      "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_600x900_2x.jpg"
    ),
    format!("https://steamcdn-a.akamaihd.net/steam/apps/{app_id}/library_600x900.jpg"),
    format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{app_id}/library_600x900.jpg"),
    format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/header.jpg"),
    format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/capsule_616x353.jpg"),
    format!("https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/library_600x900.jpg"),
  ]
}

/// Letra de disco Windows a partir de um path (ex. `J:\Games` → `J`).
pub fn windows_drive_letter(path: &str) -> Option<char> {
  let trimmed = path.trim();
  if trimmed.len() >= 2 {
    let bytes = trimmed.as_bytes();
    if bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
      return Some(bytes[0] as char);
    }
  }
  None
}
