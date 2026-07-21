pub(super) fn colon_update_suffix_words() -> &'static [&'static str] {
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

pub(super) fn is_version_fragment_token(token: &str) -> bool {
  let t = token.to_lowercase();
  if t.starts_with('v') && t.len() > 1 {
    return t.chars().skip(1).all(|c| c.is_ascii_digit() || c == '.');
  }
  if t.contains('.') {
    return t.chars().all(|c| c.is_ascii_digit() || c == '.');
  }
  false
}

pub(super) fn is_trailing_noise_token(token: &str) -> bool {
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
