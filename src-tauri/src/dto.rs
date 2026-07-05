use serde::{Deserialize, Serialize};

pub const QUEUE_EVENT_JOB_PROGRESS: &str = "queue://job-progress";
pub const APP_EVENT_DEEP_LINK: &str = "app://deep-link";
pub const EXTRACT_EVENT_STATUS: &str = "extract://status";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathsPayload {
  pub app_data_dir: String,
  pub app_config_dir: String,
  pub app_cache_dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLibraryItemDto {
  pub name: String,
  pub path: String,
  pub is_dir: bool,
  pub size_bytes: u64,
  pub modified_at: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteLocalLibraryItemPayload {
  pub path: String,
}

// ── DTOs: Sources ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddSourcePayload {
  pub name: String,
  pub base_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddDownloadSourcePayload {
  pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct RemoveSourcePayload {
  pub id: i64,
}

#[derive(Debug, Deserialize)]
pub struct RemoveHydraSourcePayload {
  pub id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDto {
  pub id: i64,
  pub name: String,
  pub base_url: String,
  pub status: String,
  pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HydraSourceDto {
  pub id: String,
  pub name: String,
  pub url: String,
  pub status: String,
  pub download_count: i64,
  pub fingerprint: Option<String>,
  pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct TestSourcePayload {
  pub id: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestSourceResultDto {
  pub source_id: i64,
  pub ok: bool,
  pub status_code: Option<u16>,
  pub latency_ms: u128,
  pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSourceChangeDto {
  pub game_id: i64,
  pub new_download_options_count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchGameOptionsPayload {
  pub game_id: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOptionDto {
  pub source_id: String,
  pub source_name: String,
  pub title: String,
  pub download_type: String,
  pub url: String,
  pub quality: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub cover_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchDownloadOptionsPayload {
  pub query: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCatalogPayload {
  pub query: String,
  pub include_steam: Option<bool>,
  pub only_with_sources: Option<bool>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct EmbeddedCatalogEntry {
  pub title: String,
  pub genre: String,
  pub steam_app_id: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CatalogGameDto {
  pub id: String,
  pub title: String,
  pub genre: String,
  pub cover_url: Option<String>,
  pub source: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDefaultDownloadPathPayload {
  pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSeedTorrentsEnabledPayload {
  pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAppSettingPayload {
  pub key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAppSettingPayload {
  pub key: String,
  pub value: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskPathPayload {
  pub path: String,
}

#[derive(Debug, Clone)]
pub struct SourceEntry {
  pub id: i64,
  pub name: String,
  pub base_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceOptionItem {
  pub title: Option<String>,
  pub url: String,
  #[serde(alias = "download_type")]
  pub download_type: Option<String>,
  pub quality: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SourceSearchResponse {
  pub options: Vec<SourceOptionItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydraChangesResponseItem {
  pub shop: String,
  pub object_id: String,
  pub new_download_options_count: i64,
}

// ── DTOs: Queue ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueJobPayload {
  pub title: String,
  pub url: String,
  pub dest_path: String,
  pub priority: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct JobIdPayload {
  pub id: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadJobDto {
  pub id: i64,
  pub title: String,
  pub url: String,
  pub dest_path: String,
  pub status: String,
  pub priority: i64,
  pub progress: i64,
  pub bytes_downloaded: i64,
  pub total_bytes: i64,
  pub error_msg: Option<String>,
  pub created_at: String,
  pub updated_at: String,
}

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
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeepLinkEventPayload {
  pub url: String,
  pub game_id: Option<String>,
  pub action: Option<String>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarEnqueuePayload {
  pub title: String,
  pub url: String,
  pub dest_path: Option<String>,
  pub priority: Option<i32>,
  pub cover_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SidecarJobForLaunch {
  pub id: String,
  pub title: String,
  #[serde(default, alias = "destPath")]
  pub dest_path: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchGamePayload {
  pub title: String,
  pub path: String,
  pub job_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLibraryGameRootPayload {
  pub title: String,
  pub dest_path: String,
  pub game_root: String,
  pub job_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPathStateDto {
  pub has_game: bool,
  pub needs_install: bool,
  pub install_path: Option<String>,
  pub needs_extraction: bool,
  /// Alias de `has_game` para compatibilidade com clientes antigos.
  pub playable: bool,
  /// Pasta de instalação indicada manualmente pelo utilizador (fora da pasta de download).
  pub custom_game_root: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameCoverDto {
  pub title_key: String,
  pub cover_url: String,
  pub local_path: Option<String>,
}
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
}
