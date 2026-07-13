import { tauriClient } from './client'
import type {
  AddSourceInput,
  CatalogChange,
  CatalogGame,
  DownloadOption,
  GameCover,
  GameDetail,
  GetGameDetailInput,
  LibraryPathState,
  LocalLibraryItem,
  ResolveGenresBatchInput,
  ResolvedGenre,
  SearchCatalogInput,
  SearchDownloadOptionsInput,
  Source,
  SyncAllLocalSourcesResult,
  SyncLocalSourceResult,
  CoverPrecacheStatus,
  SteamAppIndexStatus,
} from '../../types/contracts'

export const sourcesApi = {
  addSource: (payload: AddSourceInput) =>
    tauriClient.invoke<Source>('add_download_source', { payload }),
  listSources: () => tauriClient.invoke<Source[]>('get_download_sources'),
  syncLocalSource: (id: string) =>
    tauriClient.invoke<SyncLocalSourceResult>('sync_local_source_catalog', {
      payload: { id },
    }),
  syncAllLocalSources: () =>
    tauriClient.invoke<SyncAllLocalSourcesResult>('sync_all_local_source_catalogs'),
  removeSource: (id: string) =>
    tauriClient.invoke<void>('remove_download_source', { payload: { id } }),
  openCatalogsCacheFolder: () =>
    tauriClient.invoke<string>('open_catalogs_cache_folder'),
  openExternalUrl: (url: string) =>
    tauriClient.invoke<void>('open_external_url', { url }),
  searchDownloadOptions: (payload: SearchDownloadOptionsInput) =>
    tauriClient.invoke<DownloadOption[]>('search_download_options', { payload }),
  searchGameCatalog: (payload: SearchCatalogInput) =>
    tauriClient.invoke<CatalogGame[]>('search_game_catalog', { payload }),
  resolveGameGenresBatch: (payload: ResolveGenresBatchInput) =>
    tauriClient.invoke<ResolvedGenre[]>('resolve_game_genres_batch', { payload }),
  getGameDetail: (payload: GetGameDetailInput) =>
    tauriClient.invoke<GameDetail>('get_game_detail', { payload }),
  checkCatalogChanges: () =>
    tauriClient.invoke<CatalogChange[]>('check_catalog_changes'),
  openDeepLink: (url: string) => tauriClient.invoke<void>('open_deep_link', { url }),
  setDefaultDownloadPath: (path: string) =>
    tauriClient.invoke<void>('set_default_download_path', { payload: { path } }),
  getDefaultDownloadPath: () =>
    tauriClient.invoke<string | null>('get_default_download_path'),
  setSeedTorrentsEnabled: (enabled: boolean) =>
    tauriClient.invoke<void>('set_seed_torrents_enabled', { payload: { enabled } }),
  getSeedTorrentsEnabled: () =>
    tauriClient.invoke<boolean>('get_seed_torrents_enabled'),
  getAppSetting: (key: string) =>
    tauriClient.invoke<string | null>('get_app_setting', { payload: { key } }),
  setAppSetting: (key: string, value: string) =>
    tauriClient.invoke<void>('set_app_setting', { payload: { key, value } }),
  getDiskFreeBytesForPath: (path: string) =>
    tauriClient.invoke<number | null>('get_disk_free_bytes_for_path', { payload: { path } }),
  scanDefaultDownloadPath: () =>
    tauriClient.invoke<LocalLibraryItem[]>('scan_default_download_path'),
  deleteLocalLibraryItem: (path: string) =>
    tauriClient.invoke<void>('delete_local_library_item', { payload: { path } }),
  openLocalPath: (path: string) => tauriClient.invoke<void>('open_local_path', { path }),
  launchGame: (title: string, path: string, jobId?: string) =>
    tauriClient.invoke<string>('launch_game_from_path', {
      payload: { title, path, jobId: jobId ?? null },
    }),
  listGameCovers: () => tauriClient.invoke<GameCover[]>('list_game_covers'),
  ensureGameCoverCached: (title: string) =>
    tauriClient.invoke<string | null>('ensure_game_cover_cached', { title }),
  saveGameCover: (title: string, coverUrl: string) =>
    tauriClient.invoke<void>('save_game_cover', { title, coverUrl }),
  invalidateGameCoverLocal: (title: string) =>
    tauriClient.invoke<void>('invalidate_game_cover_local', { title }),
  resolveGameCoverUrl: (title: string) =>
    tauriClient.invoke<string | null>('resolve_game_cover_url', { title }),
  resolveCoversForTitles: (titles: string[]) =>
    tauriClient.invoke<import('../../types/contracts').ResolvedCoverBatchItem[]>(
      'resolve_covers_for_titles',
      { titles },
    ),
  getCoverPrecacheStatus: () =>
    tauriClient.invoke<CoverPrecacheStatus>('get_cover_precache_status'),
  getCoverCacheStats: () =>
    tauriClient.invoke<CoverPrecacheStatus>('get_cover_cache_stats'),
  startCoverPrecache: () =>
    tauriClient.invoke<CoverPrecacheStatus>('start_cover_precache'),
  stopCoverPrecache: () =>
    tauriClient.invoke<CoverPrecacheStatus>('stop_cover_precache'),
  retryUnresolvedCovers: () =>
    tauriClient.invoke<CoverPrecacheStatus>('retry_unresolved_covers'),
  getSteamAppIndexStatus: () =>
    tauriClient.invoke<SteamAppIndexStatus>('get_steam_app_index_status'),
  refreshSteamAppIndex: () =>
    tauriClient.invoke<SteamAppIndexStatus>('refresh_steam_app_index'),
  inspectLibraryPath: (title: string, path: string, jobId?: string) =>
    tauriClient.invoke<LibraryPathState>('inspect_library_path', {
      payload: { title, path, jobId: jobId ?? null },
    }),
  inspectLibraryPaths: (entries: import('../../types/contracts').InspectLibraryPathInput[]) =>
    tauriClient.invoke<import('../../types/contracts').InspectLibraryPathResult[]>(
      'inspect_library_paths',
      { payload: { entries: entries.map((entry) => ({
        key: entry.key,
        title: entry.title,
        path: entry.path,
        jobId: entry.jobId ?? null,
      })) } },
    ),
  setLibraryGameRoot: (title: string, destPath: string, gameRoot: string, jobId?: string) =>
    tauriClient.invoke<LibraryPathState>('set_library_game_root', {
      payload: { title, destPath, gameRoot, jobId: jobId ?? null },
    }),
  launchSetup: (title: string, path: string, jobId?: string) =>
    tauriClient.invoke<string>('launch_setup_from_path', {
      payload: { title, path, jobId: jobId ?? null },
    }),
  isExecutableRunning: (path: string) =>
    tauriClient.invoke<boolean>('is_executable_running_at_path', { path }),
  extractLibraryFolder: (title: string, path: string) =>
    tauriClient.invoke<void>('extract_library_folder', {
      payload: { title, path, jobId: null },
    }),
}
