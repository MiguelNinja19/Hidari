import { createContext, useContext, type ReactNode } from 'react'
import { useAppDispatch } from '../../app/hooks'
import { resumeJob } from '../queue/queueSlice'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { DownloadJob, LibraryPathState } from '../../shared/types/contracts'
import type { ResolvedCover } from '../covers/useGameCovers'
import {
  hasManualInstallRoot,
  isPlayableLibraryItem,
  libraryStatusMeta,
  showInstallAction,
  showLocateInstallAction,
  showPlayAction,
} from './libraryItemState'
import type { LibraryEntry } from './types'

export type LibraryControllerValue = {
  libraryItems: LibraryEntry[]
  jobs: DownloadJob[]
  pathStateByKey: Record<string, LibraryPathState>
  libraryFilter: string
  libraryStatusFilter: 'all' | 'installed' | 'not_installed'
  playBusyId: string | null
  installBusyId: string | null
  savePathError: string
  actionMessage: string
  setLibraryFilter: (value: string) => void
  setLibraryStatusFilter: (value: 'all' | 'installed' | 'not_installed') => void
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
  handleDeleteLibraryItem: (item: LibraryEntry) => Promise<void>
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
  const { jobs, pathStateByKey } = useLibraryController()
  return {
    libraryStatusMeta: (item: LibraryEntry) => libraryStatusMeta(item, jobs, pathStateByKey),
    showPlayAction: (item: LibraryEntry) => showPlayAction(item, jobs, pathStateByKey),
    showInstallAction: (item: LibraryEntry) => showInstallAction(item, jobs, pathStateByKey),
    showLocateInstallAction: (item: LibraryEntry) =>
      showLocateInstallAction(item, jobs, pathStateByKey),
    hasManualInstallRoot: (item: LibraryEntry) => hasManualInstallRoot(item, pathStateByKey),
    isLibraryInstalled: (item: LibraryEntry) => isPlayableLibraryItem(item, jobs, pathStateByKey),
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
