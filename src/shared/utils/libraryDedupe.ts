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
    // Entrada da fila: só o próprio job (e cópias no mesmo path).
    if (item.kind === 'job' && job.id === item.id) return true
    const jobPath = normalizeLibraryPath(job.destPath)
    if (!jobPath || !basePath) return false
    // Nunca associar pela raiz de downloads — apagava a fila toda.
    if (defaultRoot && (jobPath === defaultRoot || basePath === defaultRoot)) {
      return item.kind === 'job' && job.id === item.id
    }
    if (jobPath === basePath) return true
    // Só path relacionado (pasta do jogo), nunca só título.
    return jobPathsOverlap(item.destPath, job.destPath)
  })
}

export { libraryTitlesMatch }
