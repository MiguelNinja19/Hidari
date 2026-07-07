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

/// Um único regex: extrai só o nome do jogo, removendo edition, versão, DLC, repack, etc.
fn catalog_base_title_regex() -> &'static Regex {
  static RE: OnceLock<Regex> = OnceLock::new();
  RE.get_or_init(|| {
    Regex::new(
      r"(?i)^\s*(.+?)(?:\s*:\s*.+|\s*-\s+(?:v?\d[\d.]*|fitgirl|update|repack|build\b).+|\s*\([^)]*\)|\s*\[[^\]]*\])?\s*$",
    )
    .expect("catalog base title regex")
  })
}

/// Remove sufixo de versão e tudo o que vier depois (ex.: "V1 0 466", "v1.4.4.1 - Labor of Love").
fn trailing_version_regex() -> &'static Regex {
  static RE: OnceLock<Regex> = OnceLock::new();
  RE.get_or_init(|| {
    Regex::new(r"(?i)\s+v(?:er(?:sion)?)?[\s.]*\d+(?:[\s._-]\d+)*(?:\s*-\s*)?.*$")
      .expect("trailing version regex")
  })
}

fn strip_trailing_version_suffix(title: &str) -> String {
  trailing_version_regex()
    .replace(title.trim(), "")
    .trim()
    .to_string()
}

/// Nome base do jogo (sem edition, versão, repack, parênteses ou colchetes).
pub fn extract_catalog_base_title(title: &str) -> String {
  let normalized = title.replace(['™', '®', '©'], "").trim().to_string();
  if normalized.is_empty() {
    return String::new();
  }
  let base = catalog_base_title_regex()
    .captures(&normalized)
    .and_then(|caps| caps.get(1))
    .map(|m| m.as_str().trim().to_string())
    .filter(|value| !value.is_empty())
    .unwrap_or(normalized);
  strip_trailing_version_suffix(&base)
}

/// Nome curto do jogo para cards (ex.: "Elden Ring").
#[cfg(test)]
pub fn catalog_game_display_title(title: &str) -> String {
  format_catalog_display_name(&extract_catalog_base_title(title))
}

pub fn catalog_game_display_title_from_group_key(group_key: &str) -> String {
  format_catalog_display_name(&strip_trailing_version_suffix(group_key))
}

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
  extract_catalog_base_title(title)
}

/// Chave para agrupar variantes do mesmo jogo (repacks, builds, DLCs no título).
pub fn catalog_game_group_key(title: &str) -> String {
  normalize_title_key(&extract_catalog_base_title(title))
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

  #[test]
  fn catalog_game_display_title_strips_editions() {
    let title = catalog_game_display_title(
      "ELDEN RING: Deluxe Edition (v1.02 + DLC + Bonus Content, MULTi14)",
    );
    assert_eq!(title, "Elden Ring");
  }

  #[test]
  fn extract_catalog_base_title_handles_terraria() {
    assert_eq!(
      extract_catalog_base_title(
        "Terraria (v1.4.4.1 - Labor of Love Update + Bonus OST, MULTI9)"
      ),
      "Terraria"
    );
  }

  #[test]
  fn catalog_game_group_key_merges_repack_variants() {
    let a = catalog_game_group_key("Elden Ring - v1.2 - FitGirl Repack");
    let b = catalog_game_group_key("Elden Ring [FitGirl Repack]");
    assert_eq!(a, b);
    assert!(!a.is_empty());
  }

  #[test]
  fn extract_catalog_base_title_strips_trailing_version() {
    assert_eq!(
      catalog_game_display_title("Eldest Souls V1 0 466"),
      "Eldest Souls"
    );
    assert_eq!(catalog_game_display_title("Some Game v2.0.1"), "Some Game");
    assert_eq!(
      catalog_game_display_title("Terraria V1 4 4 1 Labor of Love"),
      "Terraria"
    );
    assert_eq!(
      catalog_game_display_title("Terraria v1.4.4.1 - Labor of Love Update"),
      "Terraria"
    );
  }

  #[test]
  fn catalog_game_display_title_from_group_key_strips_version_noise() {
    assert_eq!(
      catalog_game_display_title_from_group_key("terraria v1 4 4 1 labor"),
      "Terraria"
    );
  }
}
