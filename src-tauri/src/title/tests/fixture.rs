use crate::title::{clean_title_for_matching, normalize_title_key};
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
