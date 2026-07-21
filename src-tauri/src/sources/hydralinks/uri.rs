pub(crate) fn classify_uri(uri: &str) -> Option<(String, String)> {
  let trimmed = uri.trim();
  if trimmed.is_empty() {
    return None;
  }
  let lower = trimmed.to_ascii_lowercase();
  if lower.starts_with("magnet:?") {
    return Some(("torrent".to_string(), trimmed.to_string()));
  }
  if lower.starts_with("http://") || lower.starts_with("https://") {
    let download_type = if lower.ends_with(".torrent") {
      "torrent"
    } else {
      "http"
    };
    return Some((download_type.to_string(), trimmed.to_string()));
  }
  None
}

pub(crate) fn count_usable_uris(uris: &[String]) -> usize {
  uris.iter().filter(|uri| classify_uri(uri).is_some()).count()
}
