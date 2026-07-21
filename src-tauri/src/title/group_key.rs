use super::base::extract_catalog_base_title;
use super::noise::{is_trailing_noise_token, is_version_fragment_token};
use super::normalize::normalize_title_key;

/// Normaliza `group_key` para agrupar variantes de repack/update na pesquisa.
pub fn canonical_catalog_group_key(group_key: &str) -> String {
  let mut tokens: Vec<&str> = group_key
    .split_whitespace()
    .filter(|token| !token.is_empty())
    .collect();

  if tokens.len() >= 2 {
    let last = tokens[tokens.len() - 1].to_lowercase();
    let prev = tokens[tokens.len() - 2].to_lowercase();
    if prev == "sky" && matches!(last.as_str(), "origins" | "beyond" | "next" | "waypoint") {
      tokens.pop();
    }
  }

  let mut after_version = false;

  while let Some(&last) = tokens.last() {
    let lower = last.to_lowercase();

    if is_trailing_noise_token(&lower) {
      tokens.pop();
      after_version = is_version_fragment_token(&lower);
      continue;
    }

    if after_version && lower.chars().all(|c| c.is_ascii_digit()) && lower.len() <= 3 {
      tokens.pop();
      after_version = false;
      continue;
    }

    break;
  }

  tokens.join(" ")
}

/// Chave para agrupar variantes do mesmo jogo (repacks, builds, DLCs no título).
pub fn catalog_game_group_key(title: &str) -> String {
  canonical_catalog_group_key(&normalize_title_key(&extract_catalog_base_title(title)))
}
