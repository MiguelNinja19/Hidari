use crate::title::{
  catalog_game_display_title_from_group_key, catalog_game_group_key, extract_catalog_base_title,
};

#[test]
fn catalog_game_display_title_strips_editions() {
  let title = super::super::display::catalog_game_display_title(
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
fn extract_catalog_base_title_strips_trailing_version() {
  assert_eq!(
    super::super::display::catalog_game_display_title("Eldest Souls V1 0 466"),
    "Eldest Souls"
  );
  assert_eq!(
    super::super::display::catalog_game_display_title("Some Game v2.0.1"),
    "Some Game"
  );
  assert_eq!(
    super::super::display::catalog_game_display_title("Terraria V1 4 4 1 Labor of Love"),
    "Terraria"
  );
  assert_eq!(
    super::super::display::catalog_game_display_title("Terraria v1.4.4.1 - Labor of Love Update"),
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

#[test]
fn catalog_game_group_key_merges_repack_variants() {
  let a = catalog_game_group_key("Elden Ring - v1.2 - FitGirl Repack");
  let b = catalog_game_group_key("Elden Ring [FitGirl Repack]");
  assert_eq!(a, b);
  assert!(!a.is_empty());
}
