import { useCallback } from 'react'
import type { TFunction } from 'i18next'
import type { AppDispatch } from '../../app/store'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { formatUserError } from '../../shared/utils/formatUserError'
import { enqueueJob } from '../queue/queueSlice'
import { useDiscoverCatalog } from './useDiscoverCatalog'

export function useDiscoverEnqueue(
  discover: ReturnType<typeof useDiscoverCatalog>,
  defaultDownloadPath: string,
  dispatch: AppDispatch,
  onGoDownloads: () => void,
  showError: (message: string) => void,
  t: TFunction,
) {
  return useCallback(async (
    title: string,
    url: string,
    coverUrl?: string | null,
    sourceName?: string | null,
  ) => {
    discover.setDiscoverBusy(url)
    try {
      const fromDb = await sourcesApi.getDefaultDownloadPath()
      if (!defaultDownloadPath.trim() && !fromDb) {
        showError(t('discover.noDownloadPath'))
        return
      }
      await dispatch(enqueueJob({
        title,
        url,
        destPath: defaultDownloadPath.trim() || fromDb || undefined,
        coverUrl: coverUrl ?? discover.discoverPickGame?.coverUrl ?? undefined,
        sourceName: sourceName ?? undefined,
      })).unwrap()
      discover.closeDiscoverPicker()
      onGoDownloads()
    } catch (error) {
      showError(formatUserError(error, t('discover.enqueueError')))
    } finally {
      discover.setDiscoverBusy(null)
    }
  }, [defaultDownloadPath, discover, dispatch, onGoDownloads, showError, t])
}
