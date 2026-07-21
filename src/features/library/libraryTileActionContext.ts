import type { LibraryEntry } from './types'
import type { LibraryControllerValue } from './LibraryController'

export function libraryBusyKey(item: LibraryEntry) {
  return item.kind === 'job' ? item.id : item.destPath
}

export type LibraryTileActionContext = {
  key: string
  canPlay: boolean
  canInstall: boolean
  canLocate: boolean
  canExtract: boolean
  pathStatePending: boolean
  canDelete: boolean
  playBusyId: string | null
  installBusyId: string | null
  installingKeys: ReadonlySet<string>
  handlePlayLibraryItem: (item: LibraryEntry) => Promise<void>
  requestInstallConfirm: (item: LibraryEntry) => void
  handleExtractItem: (item: LibraryEntry) => Promise<void>
  handlePickGameInstallFolder: LibraryControllerValue['handlePickGameInstallFolder']
  handlePickLaunchExe: (item: LibraryEntry) => Promise<void>
  handleCreateDesktopShortcut: (item: LibraryEntry) => Promise<void>
  handleOpenOriginLauncher: (item: LibraryEntry) => Promise<void>
  handleDeleteLibraryItem: (item: LibraryEntry) => void
  onResumeItem: (id: string) => Promise<void>
  onOpenLocalPath: (path: string) => Promise<void>
  setActiveTabDownloads: () => void
  openLibraryDetail: (item: LibraryEntry) => void
}
