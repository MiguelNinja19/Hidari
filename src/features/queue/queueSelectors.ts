import type { RootState } from '../../app/store'
import type { DownloadJob } from '../../shared/types/contracts'

const ACTIVE_JOB_STATUSES = new Set([
  'downloading',
  'pending',
  'retrying',
  'extracting',
  'seeding',
])

export const selectQueueJobs = (state: RootState): DownloadJob[] => state.queue.jobs

export const selectActiveDownloadsCount = (state: RootState): number =>
  state.queue.jobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status)).length

export const selectHasActiveDownloads = (state: RootState): boolean =>
  state.queue.jobs.some((job) => ACTIVE_JOB_STATUSES.has(job.status))
