import type { LibrarySort } from '../../shared/config/appSettings'
import type { DownloadJob } from '../../shared/types/contracts'
import {
  itemAwaitingInstall,
  isPathStateResolved,
  isPlayableLibraryItem,
  needsInstallItem,
  showLocateInstallAction,
} from './libraryItemState'
import type { LibraryControllerValue } from './LibraryController'
import type { LibraryEntry } from './types'

export const emptyPathState =
  (): LibraryControllerValue['pathStateByKey'][string] => ({
    playable: false,
    hasGame: false,
    needsInstall: false,
    needsExtraction: false,
    installPath: null,
    launchPath: null,
  })

export const normalizeDownloadPath = (path: string) =>
  path.trim().replace(/\\/g, '/').toLowerCase()

export const scoreLibraryEntry = (
  item: LibraryEntry,
  jobs: DownloadJob[],
  pathStateByKey: LibraryControllerValue['pathStateByKey'],
  defaultDownloadPath: string,
): number => {
  if (isPlayableLibraryItem(item, jobs, pathStateByKey, defaultDownloadPath))
    return 100
  if (itemAwaitingInstall(item, jobs, pathStateByKey)) {
    return item.kind === 'job' ? 90 : 70
  }
  if (
    item.kind === 'job' &&
    ['downloading', 'pending', 'retrying', 'extracting'].includes(item.status)
  ) {
    return 85
  }
  if (showLocateInstallAction(item, jobs, pathStateByKey)) return 45
  if (item.kind === 'folder' && !isPathStateResolved(item, pathStateByKey))
    return 40
  if (
    item.kind === 'job' &&
    (item.status === 'paused' || item.status === 'failed')
  )
    return 80
  if (needsInstallItem(item, pathStateByKey)) return 60
  if (item.kind === 'folder') return 35
  return 20
}

export const sortLibraryEntries = (
  items: LibraryEntry[],
  sort: LibrarySort,
): LibraryEntry[] => {
  const sorted = [...items]
  if (sort === 'title-desc') {
    sorted.sort((a, b) =>
      b.title.localeCompare(a.title, 'pt', { sensitivity: 'base' }),
    )
  } else {
    sorted.sort((a, b) =>
      a.title.localeCompare(b.title, 'pt', { sensitivity: 'base' }),
    )
  }
  return sorted
}
