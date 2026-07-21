use super::noise::colon_update_suffix_words;

pub(super) fn strip_colon_update_suffix(title: &str) -> String {
  let trimmed = title.trim();
  let Some(idx) = trimmed.find(':') else {
    return trimmed.to_string();
  };
  let before = trimmed[..idx].trim();
  let after = trimmed[idx + 1..].trim();
  if after.is_empty() || after.contains(':') {
    return trimmed.to_string();
  }
  // Mantém subtítulos com várias palavras (ex.: Spider-Man: Miles Morales).
  if after.split_whitespace().count() > 1 {
    return trimmed.to_string();
  }
  let word = after.to_lowercase();
  if colon_update_suffix_words().contains(&word.as_str()) {
    return before.to_string();
  }
  trimmed.to_string()
}
