import { tauriClient } from './client'
import type {
  AddSourceInput,
  DownloadOption,
  GameSourceChange,
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
  searchGameDownloadOptions: (gameId: number) =>
    tauriClient.invoke<DownloadOption[]>('search_game_download_options', {
      payload: { gameId },
    }),
  setDefaultDownloadPath: (path: string) =>
    tauriClient.invoke<void>('set_default_download_path', { payload: { path } }),
  getDefaultDownloadPath: () =>
    tauriClient.invoke<string | null>('get_default_download_path'),
}
