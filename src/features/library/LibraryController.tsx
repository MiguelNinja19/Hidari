import { createContext, useContext, type ReactNode } from 'react'
import { useAppDispatch } from '../../app/hooks'
import { resumeJob } from '../queue/queueSlice'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import {
  hasManualInstallRoot,
  isPathStateResolved,
  isPlayableLibraryItem,
  libraryStatusMeta,
  showInstallAction,
  showLocateInstallAction,
  showPlayAction,
} from './libraryItemState'
import type { LibraryEntry } from './types'
import type { LibraryControllerValue } from './libraryControllerValue'

export type { LibraryControllerValue } from './libraryControllerValue'

const LibraryControllerContext = createContext<LibraryControllerValue | null>(null)

export function LibraryControllerProvider({
  value,
  children,
}: {
  value: LibraryControllerValue
  children: ReactNode
}) {
  return (
    <LibraryControllerContext.Provider value={value}>{children}</LibraryControllerContext.Provider>
  )
}

export function useLibraryController(): LibraryControllerValue {
  const ctx = useContext(LibraryControllerContext)
  if (!ctx) {
    throw new Error('useLibraryController must be used within LibraryControllerProvider')
  }
  return ctx
}

/** Helpers expostos ao LibraryPage via contexto (evita prop drilling). */
export function useLibraryItemHelpers() {
  const { jobs, pathStateByKey, defaultDownloadPath, installingKeys } = useLibraryController()

  const itemBusyKey = (item: LibraryEntry) => (item.kind === 'job' ? item.id : item.destPath)

  return {
    libraryStatusMeta: (item: LibraryEntry) =>
      libraryStatusMeta(item, jobs, pathStateByKey, {
        installing: installingKeys.has(itemBusyKey(item)),
        defaultDownloadPath,
      }),
    showPlayAction: (item: LibraryEntry) =>
      showPlayAction(item, jobs, pathStateByKey, defaultDownloadPath),
    showInstallAction: (item: LibraryEntry) =>
      showInstallAction(item, jobs, pathStateByKey, defaultDownloadPath),
    showLocateInstallAction: (item: LibraryEntry) =>
      showLocateInstallAction(item, jobs, pathStateByKey, defaultDownloadPath),
    hasManualInstallRoot: (item: LibraryEntry) => hasManualInstallRoot(item, pathStateByKey),
    isPathStateResolved: (item: LibraryEntry) => isPathStateResolved(item, pathStateByKey),
    isLibraryInstalled: (item: LibraryEntry) =>
      isPlayableLibraryItem(item, jobs, pathStateByKey, defaultDownloadPath),
  }
}

export function useLibraryResumeItem() {
  const dispatch = useAppDispatch()
  return async (id: string) => {
    await dispatch(resumeJob(id))
  }
}

export function useOpenLocalPath() {
  return sourcesApi.openLocalPath
}
