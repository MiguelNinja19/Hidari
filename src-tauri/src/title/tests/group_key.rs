use crate::title::{catalog_game_group_key, catalog_search_group_keys_equivalent};

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
