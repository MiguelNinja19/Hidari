pub(super) fn job_identity_key(url: &str, dest_path: &str, title: &str) -> String {
  format!(
    "{}|{}|{}",
    url.trim().to_ascii_lowercase(),
    dest_path.trim().to_ascii_lowercase(),
    title.trim().to_ascii_lowercase()
  )
}
