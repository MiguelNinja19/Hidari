import type { LibraryEntry } from '../../features/library/types'
import type { DownloadJob } from '../types/contracts'
import { resolveDeletePath } from './archive'
import { jobPathsOverlap } from './jobExtraction'
import { libraryGameKey } from './normalizeTitleKey'

export function dedupeLibraryEntries(
  entries: LibraryEntry[],
  scoreEntry: (item: LibraryEntry) => number,
): LibraryEntry[] {
  const groups = new Map<string, LibraryEntry[]>()

  for (const item of entries) {
    const key = libraryGameKey(item.title)
    const bucket = groups.get(key) ?? []
    bucket.push(item)
    groups.set(key, bucket)
  }

  const result: LibraryEntry[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]!)
      continue
    }
    group.sort((a, b) => scoreEntry(b) - scoreEntry(a))
    result.push(group[0]!)
  }

  return result
}

export function findRelatedLibraryJobs(
  item: LibraryEntry,
  jobs: DownloadJob[],
): DownloadJob[] {
  const gameKey = libraryGameKey(item.title)
  const basePath = resolveDeletePath(item.destPath).toLowerCase()

  return jobs.filter((job) => {
    if (job.status === 'cancelled') return false
    if (libraryGameKey(job.title) === gameKey) return true
    if (resolveDeletePath(job.destPath).toLowerCase() === basePath) return true
    return jobPathsOverlap(item.destPath, job.destPath)
  })
}

export { libraryGameKey }
