import { tauriClient } from './client'
import type { AddSourceInput, GameSourceChange, Source } from '../../types/contracts'

export const sourcesApi = {
  addSource: (payload: AddSourceInput) =>
    tauriClient.invoke<Source>('add_source', { payload }),
  listSources: () => tauriClient.invoke<Source[]>('list_sources'),
  removeSource: (id: number) =>
    tauriClient.invoke<void>('remove_source', { payload: { id } }),
  getDownloadSourcesChanges: () =>
    tauriClient.invoke<GameSourceChange[]>('get_download_sources_changes'),
}
