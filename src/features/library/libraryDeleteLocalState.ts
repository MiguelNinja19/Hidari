import type { AppDispatch } from '../../app/store'
import type { DownloadJob, LocalLibraryItem } from '../../shared/types/contracts'
import { normalizeLibraryPath } from '../../shared/utils/jobExtraction'
import { libraryTitlesMatch } from '../../shared/utils/libraryDedupe'
import { resolveDeletePath } from '../../shared/utils/archive'
import { removeJobLocally } from '../queue/queueSlice'
import type { LocalItemsSetter, PathStateSetter, StringRef } from './libraryControllerTypes'
import { removeLibraryPathStateCacheKeys } from './libraryPathStateCache'
import type { LibraryEntry } from './types'

type Args = {
  item: LibraryEntry
  relatedJobs: DownloadJob[]
  hideKeys: string[]
  dispatch: AppDispatch
  setHiddenLibraryKeys: React.Dispatch<React.SetStateAction<Set<string>>>
  setLocalLibraryItems: LocalItemsSetter
  setPathStateByKey: PathStateSetter
  defaultDownloadPathRef: StringRef
}

export function applyDeletedLocalState(args: Args) {
  const deletePath = resolveDeletePath(args.item.destPath)
  const deleteNorm = normalizeLibraryPath(deletePath)
  args.setHiddenLibraryKeys((prev) => new Set([...prev, ...args.hideKeys]))
  args.setLocalLibraryItems((prev) => prev.filter((folder) => {
    if (!folder.isDir) return true
    const folderNorm = normalizeLibraryPath(folder.path)
    if (folderNorm === deleteNorm) return false
    if (args.relatedJobs.some((job) =>
      folderNorm === normalizeLibraryPath(job.destPath),
    )) {
      return false
    }
    // Só esconde pastas com o mesmo título se estiverem na árvore do path apagado.
    if (
      libraryTitlesMatch(folder.name, args.item.title) &&
      deleteNorm &&
      (folderNorm.startsWith(`${deleteNorm}/`) || deleteNorm.startsWith(`${folderNorm}/`))
    ) {
      return false
    }
    return true
  }))
  for (const job of args.relatedJobs) args.dispatch(removeJobLocally(job.id))
  args.setPathStateByKey((prev) => {
    const next = { ...prev }
    const shouldRemove = (key: string) =>
      key.includes(deletePath.toLowerCase()) ||
      args.relatedJobs.some((job) => key === `job:${job.id}`)
    for (const key of Object.keys(next)) {
      if (shouldRemove(key)) delete next[key]
    }
    removeLibraryPathStateCacheKeys(
      shouldRemove,
      args.defaultDownloadPathRef.current,
    )
    return next
  })
}

export function withoutDeletedTitle(
  items: LocalLibraryItem[],
  title: string,
) {
  return items.filter(
    (folder) => !folder.isDir || !libraryTitlesMatch(folder.name, title),
  )
}
