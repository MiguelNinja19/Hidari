use super::{title_matches_query, title_word_matches_query_word};

#[test]
fn substring_finds_letters_anywhere_in_title() {
  assert!(title_matches_query("Mega Man 11", "mega"));
  assert!(title_matches_query("Omega Protocol", "mega"));
  assert!(title_matches_query("OUTBREAK: SHADES OF HORROR", "hades"));
}

#[test]
fn hades_matches_hades_titles() {
  assert!(title_matches_query(
    "HADES - V1.35966 (V1.0) + BONUS SOUNDTRACK",
    "HADES",
  ));
  assert!(title_matches_query("HADES II - V1.137792 + BONUS OST", "HADES"));
}

#[test]
fn substring_inside_single_word() {
  assert!(title_word_matches_query_word("shades", "hades"));
  assert!(title_word_matches_query_word("megaman", "mega"));
}

#[test]
fn megaman_matches_spaced_title() {
  assert!(title_matches_query("Mega Man 11", "megaman"));
  assert!(title_matches_query("Megaman 11", "mega man"));
}

#[test]
fn short_tokens_require_exact_word() {
  assert!(title_matches_query("Hades II", "ii"));
  assert!(!title_matches_query("Civilization", "ii"));
}

#[test]
fn folds_accents() {
  assert!(title_matches_query("Pokémon Legends", "pokemon"));
  assert!(title_matches_query("Café Grande", "cafe"));
}
