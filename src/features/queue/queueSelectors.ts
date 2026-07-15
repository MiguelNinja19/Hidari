import type { RootState } from '../../app/store'
import type { DownloadJob } from '../../shared/types/contracts'
import { isDownloadFullyTransferred } from '../../shared/utils/jobProgress'

const ACTIVE_DOWNLOAD_STATUSES = new Set([
  'downloading',
  'pending',
  'retrying',
  'extracting',
])

/** Ainda a transferir o jogo — não seeding/100% concluído. */
export function isActivelyDownloading(job: DownloadJob): boolean {
  if (!ACTIVE_DOWNLOAD_STATUSES.has(job.status)) return false
  // 100% ainda marcado como downloading (aria2/semear): não conta como "em andamento".
  if (isDownloadFullyTransferred(job)) return false
  return true
}

export const selectQueueJobs = (state: RootState): DownloadJob[] => state.queue.jobs

export const selectActiveDownloadsCount = (state: RootState): number =>
  state.queue.jobs.filter((job) => isActivelyDownloading(job)).length

export const selectHasActiveDownloads = (state: RootState): boolean =>
  state.queue.jobs.some((job) => isActivelyDownloading(job))
