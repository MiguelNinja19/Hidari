use super::noise::is_trailing_noise_token;

pub fn catalog_search_group_keys_equivalent(a: &str, b: &str) -> bool {
  if a == b {
    return true;
  }
  let a_tokens: Vec<&str> = a.split_whitespace().collect();
  let b_tokens: Vec<&str> = b.split_whitespace().collect();
  if b_tokens.len() <= a_tokens.len() {
    return false;
  }
  if b_tokens[..a_tokens.len()] != a_tokens[..] {
    return false;
  }
  b_tokens[a_tokens.len()..]
    .iter()
    .all(|token| is_trailing_noise_token(token))
}
