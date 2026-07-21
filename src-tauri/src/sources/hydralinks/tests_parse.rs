#[cfg(test)]
mod parse_tests {
  use super::super::parse::parse_catalog_json;
  use super::super::uri::classify_uri;


  #[test]
  fn classifies_magnet_and_http_uris() {
    let magnet = classify_uri("magnet:?xt=urn:btih:abc123").expect("magnet");
    assert_eq!(magnet.0, "torrent");
    let http = classify_uri("https://cdn.example.com/game.zip").expect("http");
    assert_eq!(http.0, "http");
  }

  #[test]
  fn parses_hydralinks_catalog_json() {
    let body = r#"{"name":"XATAB","downloads":[{"title":"Hades","fileSize":"10 GB","uris":["magnet:?xt=urn:btih:abc123"]}]}"#;
    let catalog = parse_catalog_json(body).expect("catalog");
    assert_eq!(catalog.downloads.len(), 1);
  }

  #[test]
  fn rejects_html_saved_as_json() {
    let body = "<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>";
    let error = parse_catalog_json(body).expect_err("html");
    assert!(error.contains("HTML"));
  }

  #[test]
  fn parses_catalog_with_utf8_bom() {
    let body = "\u{feff}{\"name\":\"XATAB\",\"downloads\":[{\"title\":\"Hades\",\"uris\":[\"magnet:?xt=urn:btih:abc\"]}]}";
    let catalog = parse_catalog_json(body).expect("bom");
    assert_eq!(catalog.downloads.len(), 1);
  }

  #[test]
  fn accepts_uris_as_single_string() {
    let body = r#"{"name":"Test","downloads":[{"title":"Game","uris":"magnet:?xt=urn:btih:abc123"}]}"#;
    let catalog = parse_catalog_json(body).expect("string uri");
    assert_eq!(catalog.downloads[0].uris.len(), 1);
  }

  #[test]
  fn accepts_snake_case_catalog_fields() {
    let body = r#"{"name":"Test","downloads":[{"title":"Game","file_size":"5 GB","uris":["https://example.com/file.zip"]}]}"#;
    let catalog = parse_catalog_json(body).expect("snake");
    assert_eq!(catalog.downloads[0].file_size.as_deref(), Some("5 GB"));
  }
}
