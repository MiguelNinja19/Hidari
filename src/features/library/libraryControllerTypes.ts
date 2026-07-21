import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { AppDispatch } from '../../app/store'
import type { NavTab } from '../../layout/types'
import type {
  CatalogGame,
  DownloadJob,
  DownloadOption,
  LocalLibraryItem,
} from '../../shared/types/contracts'
import type { LibraryControllerValue } from './LibraryController'
import type { LibraryEntry } from './types'

export type LibraryDetailState = {
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
}

export type UseLibraryControllerStateArgs = {
  activeTab: NavTab
  jobs: DownloadJob[]
  queueInitialized: boolean
  defaultDownloadPath: string
  dispatch: AppDispatch
  onGoDiscover: () => void
  onGoDownloads: () => void
  resolveCover: LibraryControllerValue['resolveCover']
  resolveCoversBatch: (titles: string[]) => void
  invalidateLocalCover: (title: string, coverUrl?: string | null) => void
}

export type PathStateMap = LibraryControllerValue['pathStateByKey']
export type PathStateSetter = Dispatch<SetStateAction<PathStateMap>>
export type LocalItemsSetter = Dispatch<SetStateAction<LocalLibraryItem[]>>
export type StringRef = MutableRefObject<string>

export type InstallWatchApi = {
  installingKeys: ReadonlySet<string>
  installWatchRef: MutableRefObject<
    Map<string, { intervalId: number; busyKey: string }>
  >
  refreshPathState: (
    title: string,
    path: string,
    jobId?: string,
  ) => Promise<unknown>
  removeInstallingKey: (busyKey: string) => void
  watchForInstalledGame: (
    title: string,
    destPath: string,
    busyKey: string,
    setupPath: string,
    jobId?: string,
  ) => void
}
