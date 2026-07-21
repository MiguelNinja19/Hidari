use std::path::Path;

pub(crate) fn path_matches_title_tokens(path: &Path, title_tokens: &[String]) -> bool {
  if title_tokens.is_empty() {
    return true;
  }
  let file_name = path
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or_default()
    .to_lowercase();
  if title_tokens.iter().any(|token| file_name.contains(token)) {
    return true;
  }
  let path_lower = path.to_string_lossy().to_lowercase();
  title_tokens.iter().any(|token| path_lower.contains(token))
}
