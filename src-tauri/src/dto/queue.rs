use serde::{Deserialize, Serialize};

pub const QUEUE_EVENT_JOB_PROGRESS: &str = "queue://job-progress";
pub const QUEUE_EVENT_JOBS_RESTORED: &str = "queue://jobs-restored";
pub const APP_EVENT_DEEP_LINK: &str = "app://deep-link";
pub const EXTRACT_EVENT_STATUS: &str = "extract://status";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JobProgressEvent {
  pub job_id: String,
  pub progress: f64,
  pub status: String,
  pub speed_bytes_per_sec: u64,
  pub eta_seconds: i64,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub bytes_downloaded: Option<i64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub total_bytes: Option<i64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error_msg: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeepLinkEventPayload {
  pub url: String,
  pub game_id: Option<String>,
  pub action: Option<String>,
  pub search_query: Option<String>,
  pub group_key: Option<String>,
  pub title: Option<String>,
  /// Pasta do jogo (destPath) para `hidari://launch?...&path=...`
  pub path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarEnqueuePayload {
  pub title: String,
  pub url: String,
  pub dest_path: Option<String>,
  pub priority: Option<i32>,
  pub cover_url: Option<String>,
  pub source_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SidecarJobForLaunch {
  pub id: String,
  pub title: String,
  #[serde(default, alias = "destPath")]
  pub dest_path: String,
}
