#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
  let trimmed = url.trim();
  if trimmed.is_empty() {
    return Err("empty_url".to_string());
  }
  let parsed = url::Url::parse(trimmed).map_err(|error| format!("invalid_url: {error}"))?;
  match parsed.scheme() {
    "http" | "https" => {}
    other => return Err(format!("unsupported_url_scheme: {other}")),
  }
  open::that(trimmed).map_err(|error| format!("could_not_open_url: {error}"))
}
