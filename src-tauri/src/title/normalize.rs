use super::regex::{repack_noise_regex, whitespace_regex};

pub fn clean_title_for_matching(title: &str) -> String {
  let base = title.replace(['™', '®', '©'], "");
  let stripped = repack_noise_regex().replace_all(&base, " ");
  let collapsed = whitespace_regex()
    .replace_all(stripped.trim(), " ")
    .trim()
    .to_string();
  if collapsed.is_empty() {
    title.trim().to_string()
  } else {
    collapsed
  }
}

pub fn normalize_title_key(title: &str) -> String {
  let cleaned = title
    .to_lowercase()
    .replace(['™', '®', '©', '\'', '\u{2019}'], "")
    .chars()
    .map(|c| {
      if c.is_alphanumeric() || c == ' ' {
        c
      } else {
        ' '
      }
    })
    .collect::<String>();
  cleaned
    .split_whitespace()
    .take(6)
    .collect::<Vec<_>>()
    .join(" ")
}

pub fn tokenize_title(title: &str) -> Vec<String> {
  // Preferir o nome-base do catálogo: títulos de repack ("Labor of Love", "Bonus OST")
  // geravam tokens genéricos que faziam match com pastas/exes de outros jogos.
  let base = super::base::extract_catalog_base_title(title);
  let source = if base.chars().filter(|c| c.is_alphanumeric()).count() >= 3 {
    base
  } else {
    clean_title_for_matching(title)
  };
  source
    .split(|ch: char| !ch.is_alphanumeric())
    .filter(|token| token.len() >= 3)
    .map(|token| token.to_lowercase())
    .collect()
}

pub fn simplify_source_search_query(title: &str) -> String {
  super::base::extract_catalog_base_title(title)
}
