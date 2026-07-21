import type { DownloadJob, LocalLibraryItem } from '../../shared/types/contracts'
import {
  activeJobBlocksLibraryFolder,
} from '../../shared/utils/jobExtraction'
import { libraryTitlesMatch } from '../../shared/utils/libraryDedupe'
import { resolveDeletePath } from '../../shared/utils/archive'
import { isActiveQueueJob, isJobFinished, jobBelongsInLibrary } from './libraryItemState'
import type { LibraryEntry } from './types'

const TERMINAL_STATUSES = new Set([
  'completed', 'seeding', 'extracted', 'skipped', 'extracting',
])

function transferIncomplete(job: DownloadJob) {
  const total = Number(job.totalBytes) || 0
  const done = Number(job.bytesDownloaded) || 0
  return total >= 5 * 1024 * 1024 && done < total * 0.995
}

function folderBlocked(
  item: LocalLibraryItem,
  jobs: DownloadJob[],
  defaultDownloadPath: string,
  jobPaths: Set<string>,
) {
  if (jobPaths.has(item.path.toLowerCase())) return true
  if (jobs.some((job) =>
    jobBelongsInLibrary(job) &&
    (libraryTitlesMatch(job.title, item.name) ||
      activeJobBlocksLibraryFolder(item.path, job.destPath, defaultDownloadPath)),
  )) return true
  if (jobs.some((job) => {
    if (!libraryTitlesMatch(job.title, item.name)) return false
    if (['cancelled', 'verify_failed', 'failed'].includes(job.status)) return false
    if (!transferIncomplete(job) &&
      (jobBelongsInLibrary(job) || TERMINAL_STATUSES.has(job.status) ||
        isJobFinished(job))) return false
    return transferIncomplete(job) ||
      (!jobBelongsInLibrary(job) && !TERMINAL_STATUSES.has(job.status))
  })) return true
  return jobs.some((job) =>
    isActiveQueueJob(job) &&
    activeJobBlocksLibraryFolder(item.path, job.destPath, defaultDownloadPath),
  )
}

export function createLibraryEntries(
  items: LocalLibraryItem[],
  jobs: DownloadJob[],
  defaultDownloadPath: string,
): LibraryEntry[] {
  const jobPaths = new Set(
    jobs.filter(jobBelongsInLibrary)
      .map((job) => resolveDeletePath(job.destPath).toLowerCase())
      .filter(Boolean),
  )
  const folders: LibraryEntry[] = items
    .filter((item) => item.isDir)
    .filter((item) => !folderBlocked(item, jobs, defaultDownloadPath, jobPaths))
    .map((item) => ({
      id: `folder-${item.path}`, title: item.name, status: 'installed',
      destPath: item.path, kind: 'folder',
    }))
  const jobEntries: LibraryEntry[] = jobs.filter(jobBelongsInLibrary).map((job) => ({
    id: job.id, title: job.title, status: job.status,
    destPath: job.destPath, kind: 'job', job,
  }))
  return [...jobEntries, ...folders]
}
