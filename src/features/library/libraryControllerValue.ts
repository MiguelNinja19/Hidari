import type { LibrarySort } from '../../shared/config/appSettings'
import type {
  CatalogGame,
  DownloadJob,
  DownloadOption,
  LibraryPathState,
} from '../../shared/types/contracts'
import type { ResolvedCover } from '../covers/useGameCovers'
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
  handlePickLaunchExe: (item: LibraryEntry) => Promise<void>
  handleCreateDesktopShortcut: (item: LibraryEntry) => Promise<void>
  handleAddExternalGame: (path: string, title?: string) => Promise<void>
  handleOpenOriginLauncher: (item: LibraryEntry) => Promise<void>
  handleDeleteLibraryItem: (item: LibraryEntry) => void
  handleConfirmDeleteLibraryItem: () => Promise<void>
  handleCancelDeleteLibraryItem: () => void
  pendingDeleteItem: LibraryEntry | null
  deletingLibraryKey: string | null
  libraryDetail: {
    item: LibraryEntry
    game: CatalogGame | null
    loading: boolean
    error: string | null
    options: DownloadOption[]
    synopsis: string | null
    screenshots: string[]
    note: string
    noteSaving: boolean
    busyUrl: string | null
  } | null
  openLibraryDetail: (item: LibraryEntry) => void
  closeLibraryDetail: () => void
  setLibraryDetailNote: (note: string) => void
  saveLibraryDetailNote: () => Promise<void>
  handleEnqueueFromLibraryDetail: (
    title: string,
    url: string,
    coverUrl?: string | null,
  ) => Promise<void>
}
