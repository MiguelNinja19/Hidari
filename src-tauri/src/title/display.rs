use super::regex::strip_trailing_version_suffix;

fn format_catalog_display_name(name: &str) -> String {
  let trimmed = name.trim();
  if trimmed.is_empty() {
    return String::new();
  }
  trimmed
    .split_whitespace()
    .map(|word| {
      let lower = word.to_lowercase();
      let mut chars = lower.chars();
      match chars.next() {
        None => String::new(),
        Some(first) => {
          let mut out = first.to_uppercase().to_string();
          out.push_str(chars.as_str());
          out
        }
      }
    })
    .collect::<Vec<_>>()
    .join(" ")
}

/// Nome curto do jogo para cards (ex.: "Elden Ring").
#[cfg(test)]
pub fn catalog_game_display_title(title: &str) -> String {
  format_catalog_display_name(&super::base::extract_catalog_base_title(title))
}

pub fn catalog_game_display_title_from_group_key(group_key: &str) -> String {
  format_catalog_display_name(&strip_trailing_version_suffix(group_key))
}
