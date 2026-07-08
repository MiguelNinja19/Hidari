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
pub struct AddDownloadSourcePayload {
  pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct RemoveHydraSourcePayload {
  pub id: String,
}

#[derive(Debug, Deserialize)]
pub struct SyncLocalSourcePayload {
  pub id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncLocalSourceResultDto {
  pub source_id: String,
  pub download_count: usize,
  pub warning: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncLocalSourceFailureDto {
  pub source_id: String,
  pub source_name: String,
  pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncAllLocalSourcesResultDto {
  pub synced: Vec<SyncLocalSourceResultDto>,
  pub failures: Vec<SyncLocalSourceFailureDto>,
  pub unchanged_count: usize,
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
  #[serde(skip_serializing_if = "Option::is_none")]
  pub api_source_id: Option<String>,
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
  pub offset: Option<usize>,
  pub limit: Option<usize>,
  /// Quando false, não resolve capas na pesquisa (mais rápido; UI resolve depois).
  pub attach_covers: Option<bool>,
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
  #[serde(skip_serializing_if = "Option::is_none")]
  pub local_cover_path: Option<String>,
  pub source: String,
  /// Número de repacks/variantes disponíveis para este jogo.
  #[serde(skip_serializing_if = "Option::is_none")]
  pub option_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetGameDetailPayload {
  pub group_key: Option<String>,
  pub title: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameDetailDto {
  pub game: CatalogGameDto,
  pub synopsis: Option<String>,
  pub screenshots: Vec<String>,
  pub trailer_url: Option<String>,
  pub trailer_thumbnail: Option<String>,
  pub steam_app_id: Option<u32>,
  pub downloads: Vec<DownloadOptionDto>,
  pub in_library: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveGenresBatchPayload {
  pub titles: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedGenreDto {
  pub title: String,
  pub genre: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleFavoritePayload {
  pub catalog_key: String,
  pub title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteCatalogEntryDto {
  pub catalog_key: String,
  pub title: String,
  pub added_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCollectionPayload {
  pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameCollectionPayload {
  pub id: String,
  pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionIdPayload {
  pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionEntryPayload {
  pub collection_id: String,
  pub catalog_key: String,
  pub title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionDto {
  pub id: String,
  pub name: String,
  pub entry_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionEntryDto {
  pub catalog_key: String,
  pub title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogChangeDto {
  pub source_id: String,
  pub source_name: String,
  pub new_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedCoverBatchItem {
  pub title: String,
  pub cover_url: Option<String>,
  pub local_cover_path: Option<String>,
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
  pub search_query: Option<String>,
  pub group_key: Option<String>,
  pub title: Option<String>,
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
pub struct InspectLibraryPathEntry {
  pub key: String,
  pub title: String,
  pub path: String,
  pub job_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectLibraryPathsPayload {
  pub entries: Vec<InspectLibraryPathEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectLibraryPathResultItem {
  pub key: String,
  pub state: LibraryPathStateDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLibraryGameRootPayload {
  pub title: String,
  pub dest_path: String,
  pub game_root: String,
  pub job_id: Option<String>,
}

#[derive(Debug, Serialize)]
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

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SteamAppIndexStatusDto {
  pub total_apps: usize,
  pub last_updated_at: Option<i64>,
  pub refreshing: bool,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CoverPrecacheStatusDto {
  pub running: bool,
  pub total: usize,
  pub processed: usize,
  pub cached: usize,
  pub downloaded: usize,
  pub unresolved: usize,
  pub failed: usize,
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
