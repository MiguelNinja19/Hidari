import { tauriClient } from './client'
import type {
  AddSourceInput, CatalogChange, CatalogGame, CoverPrecacheStatus, DownloadOption, GameCover,
  GameDetail, GetGameDetailInput, ResolveGenresBatchInput, ResolvedGenre, SearchCatalogInput,
  SearchDownloadOptionsInput, Source, SteamAppIndexStatus, SyncAllLocalSourcesResult,
  SyncLocalSourceResult,
} from '../../types/contracts'

export const catalogApi = {
  addSource: (payload: AddSourceInput) =>
    tauriClient.invoke<Source>('add_download_source', { payload }),
  listSources: () => tauriClient.invoke<Source[]>('get_download_sources'),
  syncLocalSource: (id: string) =>
    tauriClient.invoke<SyncLocalSourceResult>('sync_local_source_catalog', { payload: { id } }),
  syncAllLocalSources: () =>
    tauriClient.invoke<SyncAllLocalSourcesResult>('sync_all_local_source_catalogs'),
  removeSource: (id: string) =>
    tauriClient.invoke<void>('remove_download_source', { payload: { id } }),
  openCatalogsCacheFolder: () => tauriClient.invoke<string>('open_catalogs_cache_folder'),
  openExternalUrl: (url: string) => tauriClient.invoke<void>('open_external_url', { url }),
  searchDownloadOptions: (payload: SearchDownloadOptionsInput) =>
    tauriClient.invoke<DownloadOption[]>('search_download_options', { payload }),
  searchGameCatalog: (payload: SearchCatalogInput) =>
    tauriClient.invoke<CatalogGame[]>('search_game_catalog', { payload }),
  resolveGameGenresBatch: (payload: ResolveGenresBatchInput) =>
    tauriClient.invoke<ResolvedGenre[]>('resolve_game_genres_batch', { payload }),
  getGameDetail: (payload: GetGameDetailInput) =>
    tauriClient.invoke<GameDetail>('get_game_detail', { payload }),
  checkCatalogChanges: () => tauriClient.invoke<CatalogChange[]>('check_catalog_changes'),
  openDeepLink: (url: string) => tauriClient.invoke<void>('open_deep_link', { url }),
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
  getCoverCacheStats: () => tauriClient.invoke<CoverPrecacheStatus>('get_cover_cache_stats'),
  startCoverPrecache: () => tauriClient.invoke<CoverPrecacheStatus>('start_cover_precache'),
  stopCoverPrecache: () => tauriClient.invoke<CoverPrecacheStatus>('stop_cover_precache'),
  retryUnresolvedCovers: () =>
    tauriClient.invoke<CoverPrecacheStatus>('retry_unresolved_covers'),
  getSteamAppIndexStatus: () =>
    tauriClient.invoke<SteamAppIndexStatus>('get_steam_app_index_status'),
  refreshSteamAppIndex: () =>
    tauriClient.invoke<SteamAppIndexStatus>('refresh_steam_app_index'),
}
