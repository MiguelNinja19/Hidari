import type { LibrarySort } from '../../shared/config/appSettings'
import { libraryPlayPathKey } from '../../shared/types/contracts'
import type { DownloadJob, LibraryPlayStat } from '../../shared/types/contracts'
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
  playStatsByKey: Record<string, LibraryPlayStat> = {},
): LibraryEntry[] => {
  const sorted = [...items]
  if (sort === 'title-desc') {
    sorted.sort((a, b) =>
      b.title.localeCompare(a.title, 'pt', { sensitivity: 'base' }),
    )
  } else if (sort === 'recent') {
    sorted.sort((a, b) => {
      const aKey = libraryPlayPathKey(a.destPath, a.title)
      const bKey = libraryPlayPathKey(b.destPath, b.title)
      const aStat = playStatsByKey[aKey]
      const bStat = playStatsByKey[bKey]
      const aTime = aStat?.lastPlayedAt ? Date.parse(aStat.lastPlayedAt) : 0
      const bTime = bStat?.lastPlayedAt ? Date.parse(bStat.lastPlayedAt) : 0
      if (bTime !== aTime) return bTime - aTime
      const aCount = aStat?.playCount ?? 0
      const bCount = bStat?.playCount ?? 0
      if (bCount !== aCount) return bCount - aCount
      return a.title.localeCompare(b.title, 'pt', { sensitivity: 'base' })
    })
  } else {
    sorted.sort((a, b) =>
      a.title.localeCompare(b.title, 'pt', { sensitivity: 'base' }),
    )
  }
  return sorted
}
