use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct PersistedQueueJob {
  pub id: String,
  pub title: String,
  pub url: String,
  pub dest_path: String,
  pub status: String,
  pub priority: i32,
  pub progress: i64,
  pub bytes_downloaded: i64,
  pub total_bytes: i64,
  pub error_msg: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct RestoredSidecarJob {
  #[allow(dead_code)]
  id: String,
  #[serde(default)]
  title: String,
  #[serde(default)]
  url: String,
  #[serde(default, alias = "destPath")]
  dest_path: String,
  #[allow(dead_code)]
  #[serde(default)]
  status: String,
}

impl RestoredSidecarJob {
  pub(super) fn identity_key(&self) -> String {
    format!(
      "{}|{}|{}",
      self.url.trim().to_ascii_lowercase(),
      self.dest_path.trim().to_ascii_lowercase(),
      self.title.trim().to_ascii_lowercase()
    )
  }
}
