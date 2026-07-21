import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppDispatch } from '../../app/store'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { formatUserError } from '../../shared/utils/formatUserError'
import { useToast } from '../../shared/components/ToastProvider'
import { enqueueJob } from '../queue/queueSlice'
import type { LibraryDetailState } from './libraryControllerTypes'
import { loadLibraryDetail, loadingLibraryDetail } from './libraryDetailLoader'
import type { LibraryEntry } from './types'

type Args = {
  defaultDownloadPath: string
  dispatch: AppDispatch
  onGoDownloads: () => void
}

export function useLibraryDetail(args: Args) {
  const { showError } = useToast()
  const { t } = useTranslation()
  const [libraryDetail, setLibraryDetail] = useState<LibraryDetailState | null>(null)
  const requestRef = useRef(0)
  const closeLibraryDetail = useCallback(() => {
    requestRef.current += 1
    setLibraryDetail(null)
  }, [])
  const openLibraryDetail = useCallback((item: LibraryEntry) => {
    const requestId = ++requestRef.current
    setLibraryDetail(loadingLibraryDetail(item))
    void loadLibraryDetail(item, t).then((detail) => {
      if (requestRef.current === requestId) setLibraryDetail(detail)
    })
  }, [t])
  const setLibraryDetailNote = useCallback((note: string) => {
    setLibraryDetail((prev) => prev ? { ...prev, note } : prev)
  }, [])
  const saveLibraryDetailNote = useCallback(async () => {
    if (!libraryDetail) return
    const { item, note } = libraryDetail
    setLibraryDetail((prev) => prev ? { ...prev, noteSaving: true } : prev)
    try {
      await sourcesApi.setLibraryNote(item.destPath, item.title, note)
    } catch (error) {
      showError(formatUserError(error, t('library.noteSaveError')))
    } finally {
      setLibraryDetail((prev) => prev ? { ...prev, noteSaving: false } : prev)
    }
  }, [libraryDetail, showError, t])
  const handleEnqueueFromLibraryDetail = useCallback(async (
    title: string, url: string, coverUrl?: string | null,
  ) => {
    if (!libraryDetail) return
    setLibraryDetail((prev) => prev ? { ...prev, busyUrl: url } : prev)
    try {
      const hasPath = args.defaultDownloadPath.trim().length > 0
      const fromDb = await sourcesApi.getDefaultDownloadPath()
      if (!hasPath && !fromDb) {
        showError(t('discover.noDownloadPath'))
        return
      }
      await args.dispatch(enqueueJob({
        title, url,
        destPath: args.defaultDownloadPath.trim() || fromDb || undefined,
        coverUrl: coverUrl ?? undefined,
      })).unwrap()
      closeLibraryDetail()
      args.onGoDownloads()
    } catch (error) {
      showError(formatUserError(error, t('discover.enqueueError')))
    } finally {
      setLibraryDetail((prev) => prev ? { ...prev, busyUrl: null } : prev)
    }
  }, [args, closeLibraryDetail, libraryDetail, showError, t])

  return {
    libraryDetail, openLibraryDetail, closeLibraryDetail,
    setLibraryDetailNote, saveLibraryDetailNote,
    handleEnqueueFromLibraryDetail,
  }
}
