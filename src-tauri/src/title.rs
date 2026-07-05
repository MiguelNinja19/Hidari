use std::sync::OnceLock;

use regex::Regex;

fn repack_noise_regex() -> &'static Regex {
  static RE: OnceLock<Regex> = OnceLock::new();
  RE.get_or_init(|| {
    Regex::new(
      r"(?i)\(.*?(fitgirl|repack).*?\)|\[.*?\]|fitgirl[- ]?repack|,?\s*builds?\s+[\d/]+|,?\s*\+?\s*\d+\s*dlcs?(?:/bonuses?)?|,?\s*\+?\s*bonuses?",
    )
    .expect("repack noise regex")
  })
}

fn whitespace_regex() -> &'static Regex {
  static RE: OnceLock<Regex> = OnceLock::new();
  RE.get_or_init(|| Regex::new(r"\s+").expect("whitespace regex"))
}

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
    .replace(['™', '®', '©'], "")
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
  clean_title_for_matching(title)
    .split(|ch: char| !ch.is_alphanumeric())
    .filter(|token| token.len() >= 3)
    .map(|token| token.to_lowercase())
    .collect()
}

pub fn simplify_source_search_query(title: &str) -> String {
  let cleaned = title.replace(['™', '®', '©'], "").trim().to_string();
  let head = cleaned
    .split(':')
    .next()
    .unwrap_or(&cleaned)
    .split(" - ")
    .next()
    .unwrap_or(&cleaned)
    .trim();
  if head.is_empty() {
    cleaned
  } else {
    head.to_string()
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use std::path::PathBuf;

  #[test]
  fn title_cases_match_fixture() {
    let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
      .join("..")
      .join("tests")
      .join("fixtures")
      .join("title-cases.json");
    let raw = fs::read_to_string(fixture_path).expect("title-cases.json");
    let cases: Vec<serde_json::Value> = serde_json::from_str(&raw).expect("parse json");
    for case in cases {
      let input = case["input"].as_str().expect("input");
      let clean = case["cleanForMatching"].as_str().expect("cleanForMatching");
      let key = case["normalizeKey"].as_str().expect("normalizeKey");
      assert_eq!(clean_title_for_matching(input), clean, "clean: {input}");
      assert_eq!(
        normalize_title_key(&clean_title_for_matching(input)),
        key,
        "key: {input}"
      );
    }
  }
}
