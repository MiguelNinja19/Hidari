pub const HYDRA_API_URL: &str = "https://hydra-api-us-east-1.losbroxas.org";
pub const HYDRALINKS_SOURCES_BASE: &str = "https://hydralinks.cloud/sources";
pub const HYDRALINKS_MIRROR_URL_ENV: &str = "HYDRALINKS_MIRROR_URL";
pub const STEAM_STORE_SEARCH_URL: &str =
  "https://store.steampowered.com/api/storesearch/";
pub const STEAM_WEB_API_KEY_ENV: &str = "STEAM_WEB_API_KEY";
/// Lista de jogos (appid + nome) actualizada diariamente — fallback quando a API oficial exige chave.
pub const STEAM_GAMES_APPID_MIRROR_URL: &str =
  "https://raw.githubusercontent.com/jsnli/steamappidlist/master/data/games_appid.json";
pub const STEAM_STORE_APP_LIST_URL: &str =
  "https://api.steampowered.com/IStoreService/GetAppList/v1/";

pub const DOWNLOAD_ENGINE_BINARY: &str = "download-engine.exe";
pub const ARIA2_BINARY: &str = "aria2c.exe";
pub const SEVEN_ZIP_BINARY: &str = "7z.exe";

/// Tamanho mínimo aceite para ficheiro principal após download (1 MiB).
pub const MIN_DOWNLOAD_VERIFY_BYTES: u64 = 1_048_576;

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
  "udp://tracker.internetwarriors.net:1337/announce",
  "udp://tracker.openbittorrent.com:6969/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://tracker-udp.gbitt.info:80/announce",
  "udp://explodie.org:6969/announce",
  "udp://tracker.moeking.me:6969/announce",
  "http://tracker.openbittorrent.com:80/announce",
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
