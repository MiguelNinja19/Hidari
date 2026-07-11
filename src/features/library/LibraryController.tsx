import { createContext, useContext, type ReactNode } from 'react'
import { useAppDispatch } from '../../app/hooks'
import { resumeJob } from '../queue/queueSlice'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { DownloadJob, LibraryPathState } from '../../shared/types/contracts'
import type { LibrarySort } from '../../shared/config/appSettings'
import type { ResolvedCover } from '../covers/useGameCovers'
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

export type LibraryControllerValue = {
  libraryItems: LibraryEntry[]
  filteredEntries: LibraryEntry[]
  libraryReady: boolean
  refreshLibraryScan: (options?: { background?: boolean }) => Promise<void>
  defaultDownloadPath: string
  jobs: DownloadJob[]
  pathStateByKey: Record<string, LibraryPathState>
  libraryFilter: string
  librarySort: LibrarySort
  playBusyId: string | null
  installBusyId: string | null
  installingKeys: ReadonlySet<string>
  setLibraryFilter: (value: string) => void
  setLibrarySort: (value: LibrarySort) => void
  onGoDownloads: () => void
  onGoDiscover: () => void
  resolveCover: (title: string, catalogCoverUrl?: string | null) => ResolvedCover
  invalidateLocalCover: (title: string, coverUrl?: string | null) => void
  handlePlayLibraryItem: (item: LibraryEntry) => Promise<void>
  handleInstallItem: (item: LibraryEntry) => Promise<void>
  handleExtractItem: (item: LibraryEntry) => Promise<void>
  handlePickGameInstallFolder: (
    title: string,
    destPath: string,
    busyKey: string,
    jobId?: string,
  ) => Promise<void>
  handleDeleteLibraryItem: (item: LibraryEntry) => void
  handleConfirmDeleteLibraryItem: () => Promise<void>
  handleCancelDeleteLibraryItem: () => void
  pendingDeleteItem: LibraryEntry | null
  deletingLibraryKey: string | null
}

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
      }),
    showPlayAction: (item: LibraryEntry) => showPlayAction(item, jobs, pathStateByKey),
    showInstallAction: (item: LibraryEntry) => showInstallAction(item, jobs, pathStateByKey),
    showLocateInstallAction: (item: LibraryEntry) =>
      showLocateInstallAction(item, jobs, pathStateByKey),
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
