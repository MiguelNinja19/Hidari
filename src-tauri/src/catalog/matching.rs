fn fold_match_char(c: char) -> char {
  match c {
    'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
    'é' | 'è' | 'ê' | 'ë' => 'e',
    'í' | 'ì' | 'î' | 'ï' => 'i',
    'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
    'ú' | 'ù' | 'û' | 'ü' => 'u',
    'ý' | 'ÿ' => 'y',
    'ç' => 'c',
    'ñ' => 'n',
    _ => c,
  }
}

pub fn normalize_match_text(value: &str) -> String {
  value
    .to_lowercase()
    .replace(['™', '®', '©', '–', '—', '-', ':', ',', '.', '\'', '"', '’'], " ")
    .chars()
    .map(fold_match_char)
    .filter(|c| c.is_alphanumeric() || c.is_whitespace())
    .collect::<String>()
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ")
}

pub fn title_word_matches_query_word(title_word: &str, query_word: &str) -> bool {
  if title_word == query_word {
    return true;
  }
  query_word.chars().count() >= 3 && title_word.contains(query_word)
}

pub fn title_norm_matches_query_norm(title_norm: &str, query_norm: &str) -> bool {
  let title_words: Vec<&str> = title_norm
    .split_whitespace()
    .filter(|word| !word.is_empty())
    .collect();
  let query_words: Vec<&str> = query_norm
    .split_whitespace()
    .filter(|word| !word.is_empty())
    .collect();
  if query_words.is_empty() {
    return true;
  }
  let title_compact: String = title_words.concat();
  let query_compact = query_words.concat();
  if query_compact.chars().count() >= 3 && title_compact.contains(&query_compact) {
    return true;
  }
  query_words.iter().all(|query_word| {
    if query_word.chars().count() <= 2 {
      title_words.iter().any(|title_word| *title_word == *query_word)
    } else {
      title_compact.contains(query_word)
    }
  })
}

pub fn title_matches_query(title: &str, query: &str) -> bool {
  title_norm_matches_query_norm(
    &normalize_match_text(title),
    &normalize_match_text(query),
  )
}
