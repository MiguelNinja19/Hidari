import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppDispatch } from '../../app/store'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { DownloadJob } from '../../shared/types/contracts'
import { formatUserError } from '../../shared/utils/formatUserError'
import { formatLibraryDeleteError, isFileLockDeleteError } from '../../shared/utils/libraryDelete'
import { findRelatedLibraryJobs } from '../../shared/utils/libraryDedupe'
import { libraryGameKeyCandidates } from '../../shared/utils/normalizeTitleKey'
import { useToast } from '../../shared/components/ToastProvider'
import { fetchJobs } from '../queue/queueSlice'
import { itemPathCtx, pathStateKey } from './libraryItemState'
import type { LocalItemsSetter, PathStateSetter, StringRef } from './libraryControllerTypes'
import { executeLibraryDelete } from './libraryDeleteExecution'
import { applyDeletedLocalState, withoutDeletedTitle } from './libraryDeleteLocalState'
import { useLibraryDeletePrompt } from './useLibraryDeletePrompt'

type Args = {
  jobs: DownloadJob[]
  defaultDownloadPath: string
  localLibraryItems: LocalLibraryItem[]
  dispatch: AppDispatch
  setLocalLibraryItems: LocalItemsSetter
  setPathStateByKey: PathStateSetter
  defaultDownloadPathRef: StringRef
  setHiddenLibraryKeys: React.Dispatch<React.SetStateAction<Set<string>>>
  installWatchRef: { current: {
    get: (key: string) => { intervalId: number } | undefined
    delete: (key: string) => boolean
  }}
  removeInstallingKey: (key: string) => void
}

export function useLibraryDelete(args: Args) {
  const { showError } = useToast()
  const { t } = useTranslation()
  const [deletingLibraryKey, setDeletingLibraryKey] = useState<string | null>(null)
  const prompt = useLibraryDeletePrompt(deletingLibraryKey)

  const handleConfirmDeleteLibraryItem = useCallback(async () => {
    const item = prompt.pendingDeleteItem
    if (!item || deletingLibraryKey) return
    const busyKey = item.kind === 'job' ? item.id : item.destPath
    setDeletingLibraryKey(busyKey)
    const relatedJobs = findRelatedLibraryJobs(item, args.jobs, args.defaultDownloadPath)
    const watchKey = pathStateKey(item.destPath, itemPathCtx(item))
    const watch = args.installWatchRef.current.get(watchKey)
    if (watch) {
      window.clearInterval(watch.intervalId)
      args.installWatchRef.current.delete(watchKey)
    }
    args.removeInstallingKey(busyKey)
    const applyLocal = () => applyDeletedLocalState({
      item,
      relatedJobs,
      dispatch: args.dispatch,
      hideKeys: libraryGameKeyCandidates(item.title),
      setHiddenLibraryKeys: args.setHiddenLibraryKeys,
      setLocalLibraryItems: args.setLocalLibraryItems,
      setPathStateByKey: args.setPathStateByKey,
      defaultDownloadPathRef: args.defaultDownloadPathRef,
    })
    try {
      const result = await executeLibraryDelete({
        item,
        relatedJobs,
        dispatch: args.dispatch,
        localLibraryItems: args.localLibraryItems,
        defaultDownloadPath: args.defaultDownloadPath,
        onUninstallError: (error) =>
          showError(formatUserError(error, t('library.uninstallError'))),
      })
      args.setLocalLibraryItems(withoutDeletedTitle(result.scanned, item.title))
      if (result.errors.length > 0) {
        if (!result.errors.some(isFileLockDeleteError)) throw result.errors[0]
        applyLocal()
        showError(formatLibraryDeleteError(result.errors))
      } else {
        applyLocal()
      }
      prompt.clearDeletePrompt()
    } catch (error) {
      if (isFileLockDeleteError(error)) {
        applyLocal()
        showError(formatLibraryDeleteError([error]))
      } else {
        showError(formatUserError(error, t('library.deleteError')))
        void args.dispatch(fetchJobs())
      }
      // Se o scan falhar, manter a lista actual — nunca limpar a biblioteca para [].
      try {
        const scanned = await sourcesApi.scanDefaultDownloadPath()
        args.setLocalLibraryItems(
          isFileLockDeleteError(error)
            ? withoutDeletedTitle(scanned, item.title)
            : scanned,
        )
      } catch {
        // Mantém localLibraryItems já em memória.
      }
      prompt.clearDeletePrompt()
    } finally {
      setDeletingLibraryKey(null)
    }
  }, [args, deletingLibraryKey, prompt, showError, t])

  return {
    pendingDeleteItem: prompt.pendingDeleteItem,
    handleDeleteLibraryItem: prompt.handleDeleteLibraryItem,
    handleCancelDeleteLibraryItem: prompt.handleCancelDeleteLibraryItem,
    deletingLibraryKey,
    handleConfirmDeleteLibraryItem,
  }
}
