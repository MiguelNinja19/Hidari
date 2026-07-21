/// Padrões LIKE amigáveis ao índice: primeira palavra como prefixo, restantes como contém.
/// Padrões LIKE para `title_norm` (usado em testes e disponível para pesquisas SQL).
#[allow(dead_code)]
pub fn build_catalog_title_norm_patterns(query_norm: &str) -> Vec<String> {
  let words: Vec<&str> = query_norm
    .split_whitespace()
    .filter(|word| !word.is_empty())
    .collect();
  if words.is_empty() {
    return Vec::new();
  }
  if words.len() == 1 {
    return vec![format!("{}%", words[0])];
  }
  let mut patterns = vec![format!("{}%", words[0])];
  for word in &words[1..] {
    patterns.push(format!("%{}%", word));
  }
  patterns
}
