use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExtractStatusEvent {
  pub job_id: String,
  pub status: String,
  pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SidecarJobWatcher {
  pub id: String,
  pub title: String,
  #[serde(default, alias = "destPath")]
  pub dest_path: String,
  pub status: String,
  #[serde(default, alias = "bytesDownloaded", alias = "downloadedBytes")]
  pub bytes_downloaded: i64,
  #[serde(default, alias = "totalBytes", alias = "totalSize")]
  pub total_bytes: i64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SidecarJobProgressRow {
  pub id: String,
  pub status: String,
  #[serde(default, alias = "bytesDownloaded", alias = "downloadedBytes", alias = "downloaded")]
  pub bytes_downloaded: i64,
  #[serde(default, alias = "totalBytes", alias = "totalSize", alias = "size")]
  pub total_bytes: i64,
  #[serde(default, alias = "speedBps", alias = "speedBytesPerSec")]
  pub speed_bps: i64,
  #[serde(default, alias = "etaSeconds")]
  pub eta_seconds: i64,
  #[serde(default, alias = "percent", alias = "progressPercent", alias = "percentage")]
  pub progress: f64,
  #[serde(default, alias = "errorMsg")]
  pub error_msg: Option<String>,
}
