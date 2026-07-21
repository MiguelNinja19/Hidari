use super::group_key::catalog_game_group_key;
use super::normalize::{clean_title_for_matching, normalize_title_key};

/// Chave canónica para gravar/ler capas (mesmo jogo = mesma chave, com ou sem ruído de repack).
pub fn cover_storage_key(title: &str) -> String {
  let group = catalog_game_group_key(title);
  if !group.is_empty() {
    return group;
  }
  normalize_title_key(title)
}

/// Candidatos de chave para encontrar uma capa já gravada (espelha o frontend).
pub fn cover_title_key_candidates(title: &str) -> Vec<String> {
  let trimmed = title.trim();
  if trimmed.is_empty() {
    return Vec::new();
  }

  let mut seen = std::collections::HashSet::new();
  let mut keys = Vec::new();
  let mut push = |value: String| {
    if value.is_empty() || !seen.insert(value.clone()) {
      return;
    }
    keys.push(value);
  };

  push(cover_storage_key(trimmed));
  push(catalog_game_group_key(trimmed));
  push(normalize_title_key(&clean_title_for_matching(trimmed)));
  push(normalize_title_key(trimmed));
  keys
}
