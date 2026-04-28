import { tauriClient } from './client'
import type {
  AddSourceInput,
  CatalogGame,
  DownloadOption,
  GameSourceChange,
  LocalLibraryItem,
  SearchCatalogInput,
  SearchDownloadOptionsInput,
  Source,
  SourceTestResult,
} from '../../types/contracts'

export const sourcesApi = {
  addSource: (payload: AddSourceInput) =>
    tauriClient.invoke<Source>('add_download_source', { payload }),
  listSources: () => tauriClient.invoke<Source[]>('get_download_sources'),
  syncSources: () => tauriClient.invoke<Source[]>('sync_download_sources'),
  removeSource: (id: string) =>
    tauriClient.invoke<void>('remove_download_source', { payload: { id } }),
  testSource: (id: string) =>
    tauriClient.invoke<SourceTestResult>('test_download_source', { payload: { id } }),
  getDownloadSourcesChanges: () =>
    tauriClient.invoke<GameSourceChange[]>('check_download_sources_changes'),
  searchDownloadOptions: (payload: SearchDownloadOptionsInput) =>
    tauriClient.invoke<DownloadOption[]>('search_download_options', { payload }),
  searchGameCatalog: (payload: SearchCatalogInput) =>
    tauriClient.invoke<CatalogGame[]>('search_game_catalog', { payload }),
  searchGameDownloadOptions: (gameId: number) =>
    tauriClient.invoke<DownloadOption[]>('search_game_download_options', {
      payload: { gameId },
    }),
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
}
