import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { open } from '@tauri-apps/plugin-dialog'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { formatUserError } from '../../shared/utils/formatUserError'
import { useToast } from '../../shared/components/ToastProvider'
import { pathStateKey } from './libraryItemState'
import { setLibraryPathStateCacheEntry } from './libraryPathStateCache'
import type { PathStateSetter, StringRef } from './libraryControllerTypes'
import type { LibraryEntry } from './types'

type Args = {
  defaultDownloadPath: string
  defaultDownloadPathRef: StringRef
  setInstallBusyId: (value: string | null) => void
  setPathStateByKey: PathStateSetter
  refreshPathState: (title: string, path: string, jobId?: string) => unknown
}

export function useLibraryPathActions(args: Args) {
  const { showError } = useToast()
  const { t } = useTranslation()
  const handlePickGameInstallFolder = useCallback(async (
    title: string,
    destPath: string,
    busyKey: string,
    jobId?: string,
  ) => {
    args.setInstallBusyId(busyKey)
    try {
      const selected = await open({
        directory: true, multiple: false,
        title: t('library.pickInstallFolderTitle'),
        defaultPath: destPath || args.defaultDownloadPath || undefined,
      })
      if (typeof selected !== 'string') return
      const state = await sourcesApi.setLibraryGameRoot(
        title, destPath, selected, jobId,
      )
      const key = pathStateKey(destPath, { jobId, title })
      setLibraryPathStateCacheEntry(
        key, state, args.defaultDownloadPathRef.current,
      )
      args.setPathStateByKey((prev) => ({ ...prev, [key]: state }))
      if (!state.hasGame) showError(t('library.pickInstallFolderWarning'))
    } catch (error) {
      showError(formatUserError(error, t('library.pickInstallFolderError')))
    } finally {
      args.setInstallBusyId(null)
    }
  }, [args, showError, t])

  const handlePickLaunchExe = useCallback(async (item: LibraryEntry) => {
    const busyKey = item.kind === 'job' ? item.id : item.destPath
    args.setInstallBusyId(busyKey)
    try {
      const selected = await open({
        multiple: false,
        title: t('library.pickLaunchExeTitle'),
        defaultPath: item.destPath || args.defaultDownloadPath || undefined,
        filters: [{ name: t('library.exeFilter'), extensions: ['exe'] }],
      })
      if (typeof selected !== 'string') return
      await sourcesApi.setLibraryLaunchExe(item.title, item.destPath, selected)
      void args.refreshPathState(
        item.title, item.destPath, item.kind === 'job' ? item.id : undefined,
      )
    } catch (error) {
      showError(formatUserError(error, t('library.pickLaunchExeError')))
    } finally {
      args.setInstallBusyId(null)
    }
  }, [args, showError, t])

  return { handlePickGameInstallFolder, handlePickLaunchExe }
}
