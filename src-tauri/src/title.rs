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

/// Um único regex: extrai o nome do jogo, removendo só edições/versões/repack — não subtítulos.
/// Ex.: "ELDEN RING: Deluxe Edition (...)" → "ELDEN RING"
///      "Spider-Man: Shattered Dimensions" → mantém o subtítulo (jogos distintos).
fn catalog_base_title_regex() -> &'static Regex {
  static RE: OnceLock<Regex> = OnceLock::new();
  RE.get_or_init(|| {
    Regex::new(
      r"(?i)^\s*(.+?)(?:\s*:\s*.*?\b(?:edition|remastered|remake|definitive|goty|game of the year|deluxe|ultimate|enhanced|complete collection)\b.*|\s*-\s+(?:v?\d[\d.]*|fitgirl|update|repack|build\b).+|\s*\([^)]*\)|\s*\[[^\]]*\])?\s*$",
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

/// Nomes de updates/DLC após ":" que não são jogos distintos (ex.: No Man's Sky: Origins).
fn colon_update_suffix_words() -> &'static [&'static str] {
  &[
    "beyond",
    "next",
    "waypoint",
    "leviathan",
    "endurance",
    "synthesis",
    "vision",
    "prisms",
    "worlds",
    "frontiers",
    "aberration",
    "extinction",
    "genesis",
    "crystal",
    "isle",
    "scorched",
    "ragnarok",
    "valguero",
    "aquatica",
    "ascendancy",
    "specters",
    "liberty",
    "phantom",
    "rebirth",
    "apocalypse",
    "forsaken",
    "royale",
    "chapter",
    "season",
    "episode",
    "operation",
    "protocol",
    "overhaul",
    "expansion",
    "anniversary",
    "remastered",
  ]
}

fn is_version_fragment_token(token: &str) -> bool {
  let t = token.to_lowercase();
  if t.starts_with('v') && t.len() > 1 {
    return t.chars().skip(1).all(|c| c.is_ascii_digit() || c == '.');
  }
  if t.contains('.') {
    return t.chars().all(|c| c.is_ascii_digit() || c == '.');
  }
  false
}

fn is_trailing_noise_token(token: &str) -> bool {
  let t = token.to_lowercase();
  if colon_update_suffix_words().contains(&t.as_str()) {
    return true;
  }
  if is_version_fragment_token(&t) {
    return true;
  }
  if matches!(
    t.as_str(),
    "update"
      | "updates"
      | "patch"
      | "patches"
      | "hotfix"
      | "repack"
      | "build"
      | "builds"
      | "dlc"
      | "dlcs"
      | "bonus"
      | "bonuses"
      | "rmulti"
      | "part"
      | "chapter"
      | "episode"
      | "season"
      | "pack"
      | "bundle"
      | "remaster"
  ) {
    return true;
  }
  if t.starts_with("multi") && t.len() <= 8 {
    return true;
  }
  if t == "i" || t == "ii" || t == "iii" || t == "iv" {
    return true;
  }
  false
}

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

fn strip_colon_update_suffix(title: &str) -> String {
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

fn extract_catalog_base_title_once(title: &str) -> String {
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

/// Nome base do jogo (sem edition, versão, repack, parênteses ou colchetes).
pub fn extract_catalog_base_title(title: &str) -> String {
  let mut working = clean_title_for_matching(title);
  if working.is_empty() {
    return String::new();
  }
  for _ in 0..8 {
    let cleaned = clean_title_for_matching(&working);
    if !cleaned.is_empty() {
      working = cleaned;
    }
    let next = strip_colon_update_suffix(&extract_catalog_base_title_once(&working));
    if next == working {
      return next;
    }
    working = next;
  }
  working
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
  canonical_catalog_group_key(&normalize_title_key(&extract_catalog_base_title(title)))
}

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
  fn catalog_game_group_key_keeps_distinct_colon_subtitles() {
    let shattered = catalog_game_group_key("Spider-Man: Shattered Dimensions [FitGirl Repack]");
    let miles = catalog_game_group_key("Spider-Man: Miles Morales (v1.0)");
    let web = catalog_game_group_key("Spider-Man: Web of Shadows");
    assert_ne!(shattered, miles);
    assert_ne!(shattered, web);
    assert_ne!(miles, web);
    assert!(shattered.contains("shattered"));
    assert!(miles.contains("miles"));
  }

  #[test]
  fn catalog_game_group_key_merges_edition_variants() {
    let base = catalog_game_group_key("Shadow of the Tomb Raider");
    let deluxe = catalog_game_group_key("Shadow of the Tomb Raider: Definitive Edition");
    assert_eq!(base, deluxe);
  }

  #[test]
  fn catalog_game_group_key_merges_no_mans_sky_variants() {
    let titles = [
      "No Man's Sky",
      "No Man's Sky (v5.2.0.0 - Worlds Part II, MULTi14) [FitGirl Repack]",
      "No Man's Sky - v4.0",
      "No Man's Sky: Origins",
      "No Man's Sky: Beyond",
      "No Man's Sky: Next",
      "No Mans Sky",
      "NO MAN'S SKY",
      "No Man's Sky: Waypoint",
      "No Man's Sky (v3.0 - Origins, MULTi12)",
    ];
    let keys: Vec<String> = titles
      .iter()
      .map(|title| catalog_game_group_key(title))
      .collect();
    assert!(
      keys.iter().all(|key| key == "no mans sky"),
      "expected single group key, got: {keys:?}"
    );
  }

  #[test]
  fn catalog_game_group_key_keeps_doom_eternal_separate() {
    let doom2016 = catalog_game_group_key("DOOM");
    let eternal = catalog_game_group_key("DOOM: Eternal");
    assert_ne!(doom2016, eternal);
  }

  #[test]
  fn catalog_game_group_key_keeps_assassins_creed_origins_separate() {
    let base = catalog_game_group_key("Assassin's Creed");
    let origins = catalog_game_group_key("Assassin's Creed: Origins");
    assert_ne!(base, origins);
    assert!(origins.contains("origins"));
  }

  #[test]
  fn catalog_game_group_key_merges_general_repack_noise() {
    let titles = [
      "Cyberpunk 2077",
      "Cyberpunk 2077 (v2.1 - Update, MULTi18) [FitGirl Repack]",
      "Cyberpunk 2077 - v2.0",
    ];
    let keys: Vec<String> = titles.iter().map(|t| catalog_game_group_key(t)).collect();
    assert!(
      keys.windows(2).all(|pair| pair[0] == pair[1]),
      "expected one key, got {keys:?}"
    );
  }

  #[test]
  fn catalog_search_group_keys_merge_prefix_noise() {
    assert!(catalog_search_group_keys_equivalent(
      "elden ring",
      "elden ring update"
    ));
    assert!(!catalog_search_group_keys_equivalent(
      "doom",
      "doom eternal"
    ));
    assert!(!catalog_search_group_keys_equivalent(
      "red dead redemption",
      "red dead redemption 2"
    ));
  }

  #[test]
  fn catalog_game_display_title_from_group_key_strips_version_noise() {
    assert_eq!(
      catalog_game_display_title_from_group_key("terraria v1 4 4 1 labor"),
      "Terraria"
    );
  }
}
