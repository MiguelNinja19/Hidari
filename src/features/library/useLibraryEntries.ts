import { useMemo } from 'react'
import type { DownloadJob, LocalLibraryItem } from '../../shared/types/contracts'
import { dedupeLibraryEntries } from '../../shared/utils/libraryDedupe'
import { libraryGameKeyCandidates } from '../../shared/utils/normalizeTitleKey'
import type { LibrarySort } from '../../shared/config/appSettings'
import type { PathStateMap } from './libraryControllerTypes'
import { scoreLibraryEntry, sortLibraryEntries } from './libraryEntryHelpers'
import { createLibraryEntries } from './libraryEntryFiltering'
import { filterLibraryEntriesWithContent } from './libraryContentFilter'

type Args = {
  jobs: DownloadJob[]
  localLibraryItems: LocalLibraryItem[]
  libraryFilter: string
  librarySort: LibrarySort
  pathStateByKey: PathStateMap
  hiddenLibraryKeys: Set<string>
  defaultDownloadPath: string
}

export function useLibraryEntries(args: Args) {
  const baseEntries = useMemo(() => {
    const normalizedFilter = args.libraryFilter.trim().toLowerCase()
    const entries = createLibraryEntries(
      args.localLibraryItems,
      args.jobs,
      args.defaultDownloadPath,
    )
    const merged = dedupeLibraryEntries(
      entries,
      (item) => scoreLibraryEntry(
        item,
        args.jobs,
        args.pathStateByKey,
        args.defaultDownloadPath,
      ),
    ).filter((item) =>
      !libraryGameKeyCandidates(item.title).some((key) =>
        args.hiddenLibraryKeys.has(key),
      ),
    )
    const withContent = filterLibraryEntriesWithContent(merged, args.pathStateByKey)
    if (!normalizedFilter) return withContent
    return withContent.filter((item) =>
      item.title.toLowerCase().includes(normalizedFilter),
    )
  }, [args])

  const filteredEntries = useMemo(
    () => sortLibraryEntries(baseEntries, args.librarySort),
    [args.librarySort, baseEntries],
  )
  return { libraryItems: filteredEntries, filteredEntries }
}
