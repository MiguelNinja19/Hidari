use std::sync::OnceLock;

use regex::Regex;

pub(super) fn repack_noise_regex() -> &'static Regex {
  static RE: OnceLock<Regex> = OnceLock::new();
  RE.get_or_init(|| {
    Regex::new(
      r"(?i)\(.*?(fitgirl|repack).*?\)|\[.*?\]|fitgirl[- ]?repack|,?\s*builds?\s+[\d/]+|,?\s*\+?\s*\d+\s*dlcs?(?:/bonuses?)?|,?\s*\+?\s*bonuses?",
    )
    .expect("repack noise regex")
  })
}

pub(super) fn whitespace_regex() -> &'static Regex {
  static RE: OnceLock<Regex> = OnceLock::new();
  RE.get_or_init(|| Regex::new(r"\s+").expect("whitespace regex"))
}

/// Um único regex: extrai o nome do jogo, removendo só edições/versões/repack — não subtítulos.
pub(super) fn catalog_base_title_regex() -> &'static Regex {
  static RE: OnceLock<Regex> = OnceLock::new();
  RE.get_or_init(|| {
    Regex::new(
      r"(?i)^\s*(.+?)(?:\s*:\s*.*?\b(?:edition|remastered|remake|definitive|goty|game of the year|deluxe|ultimate|enhanced|complete collection)\b.*|\s*-\s+(?:v?\d[\d.]*|fitgirl|update|repack|build\b).+|\s*\([^)]*\)|\s*\[[^\]]*\])?\s*$",
    )
    .expect("catalog base title regex")
  })
}

/// Remove sufixo de versão e tudo o que vier depois (ex.: "V1 0 466", "v1.4.4.1 - Labor of Love").
pub(super) fn trailing_version_regex() -> &'static Regex {
  static RE: OnceLock<Regex> = OnceLock::new();
  RE.get_or_init(|| {
    Regex::new(r"(?i)\s+v(?:er(?:sion)?)?[\s.]*\d+(?:[\s._-]\d+)*(?:\s*-\s*)?.*$")
      .expect("trailing version regex")
  })
}

pub(super) fn strip_trailing_version_suffix(title: &str) -> String {
  trailing_version_regex()
    .replace(title.trim(), "")
    .trim()
    .to_string()
}
