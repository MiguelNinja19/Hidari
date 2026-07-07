import { useEffect } from 'react'
import type { AppDispatch } from '../../app/store'
import type { DownloadJob } from '../../shared/types/contracts'
import type { NavTab } from '../../layout/types'
import type { ResolvedCover } from '../covers/useGameCovers'
import { LibraryControllerProvider } from './LibraryController'
import { LibraryPage } from './LibraryPage'
import { useLibraryControllerState } from './useLibraryControllerState'

type LibraryTabProps = {
  jobs: DownloadJob[]
  defaultDownloadPath: string
  dispatch: AppDispatch
  onGoDiscover: () => void
  onGoDownloads: () => void
  onRegisterRefreshScan: (fn: ((options?: { background?: boolean }) => void) | null) => void
  resolveCover: (title: string, catalogCoverUrl?: string | null) => ResolvedCover
  resolveCoversBatch: (titles: string[]) => void
  invalidateLocalCover: (title: string, coverUrl?: string | null) => void
}

export function LibraryTab({
  jobs,
  defaultDownloadPath,
  dispatch,
  onGoDiscover,
  onGoDownloads,
  onRegisterRefreshScan,
  resolveCover,
  resolveCoversBatch,
  invalidateLocalCover,
}: LibraryTabProps) {
  const libraryController = useLibraryControllerState({
    activeTab: 'library' satisfies NavTab,
    jobs,
    defaultDownloadPath,
    dispatch,
    onGoDiscover,
    onGoDownloads,
    resolveCover,
    resolveCoversBatch,
    invalidateLocalCover,
  })

  useEffect(() => {
    onRegisterRefreshScan(() => {
      void libraryController.refreshLibraryScan()
    })
    return () => onRegisterRefreshScan(null)
  }, [libraryController.refreshLibraryScan, onRegisterRefreshScan])

  return (
    <LibraryControllerProvider value={libraryController}>
      <LibraryPage />
    </LibraryControllerProvider>
  )
}
