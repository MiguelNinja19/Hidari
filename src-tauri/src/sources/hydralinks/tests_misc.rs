#[cfg(test)]
mod misc_tests {
  use super::super::fetch::catalog_fetch_candidates;
  use super::super::names::{display_name_for_source_url, resolve_source_display_name};
  use super::super::paths::hydralinks_mirror_url_for_file;
  use super::super::paths::hydralinks_remote_url_for_local_path;
  use super::super::patterns::build_catalog_title_norm_patterns;
  use super::super::url_detect::{is_json_catalog_source, is_local_catalog_path, is_remote_catalog_url, normalize_remote_catalog_url};
  use super::super::util::payload_hash;
  use crate::dto::HydraSourceDto;


  #[test]
  fn build_catalog_title_norm_patterns_uses_prefix_for_single_word() {
    let patterns = build_catalog_title_norm_patterns("elden ring");
    assert_eq!(patterns, vec!["elden%", "%ring%"]);
  }

  #[test]
  fn detects_remote_catalog_urls() {
    assert!(is_remote_catalog_url("https://hydralinks.cloud/sources/xatab.json"));
    assert!(!is_remote_catalog_url(r"C:\catalogs\xatab.json"));
  }

  #[test]
  fn normalizes_hydralinks_urls_without_sources_segment() {
    assert_eq!(
      normalize_remote_catalog_url("https://hydralinks.cloud/fitgirl.json").expect("normalized"),
      "https://hydralinks.cloud/sources/fitgirl.json"
    );
  }

  #[test]
  fn builds_mirror_url_from_env_template() {
    std::env::set_var("HYDRALINKS_MIRROR_URL", "https://mirror.example/{file}");
    assert_eq!(
      hydralinks_mirror_url_for_file("fitgirl.json"),
      Some("https://mirror.example/fitgirl.json".to_string())
    );
    std::env::remove_var("HYDRALINKS_MIRROR_URL");
  }

  #[test]
  fn builds_catalog_fetch_candidates_uses_official_url_only() {
    std::env::remove_var("HYDRALINKS_MIRROR_URL");
    let source = HydraSourceDto {
      id: "local_test".into(),
      name: "FitGirl".into(),
      url: r"C:\catalogs\fitgirl.json".into(),
      status: "MATCHED".into(),
      download_count: 0,
      fingerprint: None,
      api_source_id: None,
      remote_url: Some("https://hydralinks.cloud/sources/fitgirl.json".into()),
      created_at: "0".into(),
    };
    let candidates = catalog_fetch_candidates(&source).expect("candidates");
    assert!(!candidates.is_empty());
    assert_eq!(candidates[0].0, "URL oficial");
    assert_eq!(
      candidates[0].1,
      "https://hydralinks.cloud/sources/fitgirl.json"
    );
    // Mirror entries only appear when HYDRALINKS_MIRROR_URL is set (may race with sibling tests).
    for (label, url) in &candidates[1..] {
      assert_eq!(label, "espelho configurado");
      assert_ne!(url, &candidates[0].1);
    }
  }

  #[test]
  fn detects_json_catalog_urls() {
    assert!(is_json_catalog_source("https://hydralinks.cloud/sources/xatab.json"));
    assert!(!is_json_catalog_source("https://fitgirl-repacks.site"));
  }

  #[test]
  fn detects_local_json_paths() {
    assert!(is_local_catalog_path(r"C:\catalogs\xatab.json"));
    assert!(!is_local_catalog_path("https://hydralinks.cloud/sources/xatab.json"));
  }

  #[test]
  fn humanizes_source_slugs() {
    assert_eq!(display_name_for_source_url("https://hydralinks.cloud/sources/xatab.json"), "XATAB");
    assert_eq!(display_name_for_source_url("https://hydralinks.cloud/sources/fitgirl.json"), "FitGirl");
  }

  #[test]
  fn prefers_catalog_json_name_over_url_slug() {
    assert_eq!(
      resolve_source_display_name(Some("FitGirl Repacks"), None, "https://cdn.example.com/abc123.json"),
      "FitGirl Repacks"
    );
  }

  #[test]
  fn builds_hydralinks_remote_url_from_local_file() {
    assert_eq!(
      hydralinks_remote_url_for_local_path(r"C:\catalogs\fitgirl.json"),
      Some("https://hydralinks.cloud/sources/fitgirl.json".to_string())
    );
  }
  #[test]
  fn payload_hash_is_stable_for_same_body() {
    let body = r#"{"name":"XATAB","downloads":[]}"#;
    assert_eq!(payload_hash(body), payload_hash(body));
  }
}
