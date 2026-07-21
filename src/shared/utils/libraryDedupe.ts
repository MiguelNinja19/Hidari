import type { LibraryEntry } from '../../features/library/types'
import type { DownloadJob } from '../types/contracts'
import { normalizeLibraryPath, jobPathsOverlap } from './jobExtraction'
import { libraryTitlesMatch } from './normalizeTitleKey'

export function dedupeLibraryEntries(
  entries: LibraryEntry[],
  scoreEntry: (item: LibraryEntry) => number,
): LibraryEntry[] {
  const groups: LibraryEntry[][] = []

  for (const item of entries) {
    const existing = groups.find((group) => {
      const head = group[0]!
      // Imports externos (Steam .url, etc.) não competem com pastas/jobs do mesmo título.
      if (Boolean(item.external) !== Boolean(head.external)) return false
      return libraryTitlesMatch(item.title, head.title)
    })
    if (existing) {
      existing.push(item)
    } else {
      groups.push([item])
    }
  }

  const result: LibraryEntry[] = []
  for (const group of groups) {
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
  defaultDownloadPath = '',
): DownloadJob[] {
  const basePath = normalizeLibraryPath(item.destPath)
  const defaultRoot = normalizeLibraryPath(defaultDownloadPath)

  return jobs.filter((job) => {
    if (job.status === 'cancelled') return false
    if (libraryTitlesMatch(job.title, item.title)) return true
    const jobPath = normalizeLibraryPath(job.destPath)
    if (jobPath === basePath) return true
    if (defaultRoot && jobPath === defaultRoot) return false
    return jobPathsOverlap(item.destPath, job.destPath)
  })
}

export { libraryTitlesMatch }
