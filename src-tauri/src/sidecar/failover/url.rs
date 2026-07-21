pub(crate) fn magnet_infohash(url: &str) -> Option<String> {
  let lower = url.to_ascii_lowercase();
  let rest = lower.strip_prefix("magnet:?")?;
  for part in rest.split('&') {
    let part = part.strip_prefix("xt=")?;
    if let Some(hash) = part.strip_prefix("urn:btih:") {
      return Some(hash.to_string());
    }
  }
  None
}

pub(crate) fn url_fingerprint(url: &str) -> String {
  magnet_infohash(url).unwrap_or_else(|| url.trim().to_ascii_lowercase())
}
