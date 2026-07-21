import type { DownloadJob } from '../../shared/types/contracts'
import { resolveJobProgressPercentFromFields } from '../../shared/utils/jobProgress'

export const normalizeJobProgress = (job: DownloadJob) =>
  resolveJobProgressPercentFromFields({
    progress: job.progress,
    bytesDownloaded: Number.isFinite(job.bytesDownloaded) ? Math.max(0, job.bytesDownloaded) : 0,
    totalBytes: Number.isFinite(job.totalBytes) ? job.totalBytes : 0,
    status: job.status,
    url: job.url,
    speedBps: job.speedBps,
  })

export const normalizeJob = (job: DownloadJob): DownloadJob => ({
  ...job,
  updatedAt: job.updatedAt ?? job.createdAt,
})

const jobProgressSignal = (job: DownloadJob) =>
  normalizeJobProgress(job) > 0 ||
  job.bytesDownloaded > 0 ||
  job.totalBytes > 0 ||
  (job.speedBps ?? 0) > 0

export const shouldPreserveProgress = (incoming: DownloadJob, previous?: DownloadJob) => {
  if (!previous) return false
  if (!jobProgressSignal(previous)) return false
  if (jobProgressSignal(incoming)) return false
  return (
    incoming.status === 'paused' ||
    incoming.status === 'downloading' ||
    incoming.status === 'pending' ||
    incoming.status === 'retrying' ||
    incoming.status === 'seeding'
  )
}

export const shouldPreserveExtractionStatus = (incoming: DownloadJob, previous?: DownloadJob) => {
  const localStatuses = ['extracting', 'extracted', 'failed', 'skipped'] as const
  if (localStatuses.includes(incoming.status as (typeof localStatuses)[number])) {
    return {
      ...incoming,
      progress:
        incoming.status === 'extracted' || incoming.status === 'skipped' ? 100 : incoming.progress,
    }
  }
  if (!previous) return incoming
  if (
    localStatuses.includes(previous.status as (typeof localStatuses)[number]) &&
    (incoming.status === 'completed' || incoming.status === 'seeding')
  ) {
    // skipped + seeding: manter seeding no FE (torrent ainda a semear).
    if (previous.status === 'skipped' && incoming.status === 'seeding') {
      return {
        ...incoming,
        status: 'seeding',
        extractionStatus: previous.extractionStatus ?? 'skipped',
        progress: 100,
        errorMsg: previous.errorMsg ?? incoming.errorMsg,
      }
    }
    return {
      ...incoming,
      status: previous.status === 'skipped' ? incoming.status : previous.status,
      extractionStatus: previous.extractionStatus ?? previous.status,
      progress:
        previous.status === 'extracted' || previous.status === 'skipped' ? 100 : incoming.progress,
      errorMsg: previous.errorMsg ?? incoming.errorMsg,
    }
  }
  return incoming
}
