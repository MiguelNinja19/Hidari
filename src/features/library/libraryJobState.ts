import {
  isAwaitingTorrentContent,
  isDownloadFullyTransferred,
  isInsufficientGameDownload,
  isTorrentLikeUrl,
  isTorrentMetadataPhase,
  MIN_READY_DOWNLOAD_BYTES,
} from '../../shared/utils/jobProgress'
import type { DownloadJob } from '../../shared/types/contracts'

const ACTIVE_QUEUE_STATUSES = new Set(['downloading', 'pending', 'retrying', 'paused'])
const LIBRARY_JOB_STATUSES = new Set([
  'completed', 'seeding', 'extracting', 'extracted', 'skipped', 'verify_failed',
])

export const isActiveQueueJob = (job: DownloadJob) => ACTIVE_QUEUE_STATUSES.has(job.status)
export { isDownloadFullyTransferred } from '../../shared/utils/jobProgress'

export function jobBelongsInLibrary(job: DownloadJob): boolean {
  if (
    isAwaitingTorrentContent(job) ||
    isTorrentMetadataPhase(job)
  ) {
    return false
  }
  // Extract falhou (ex.: senha) ou ainda só há arquivo — fica em Downloads, não na biblioteca.
  if (job.extractionStatus === 'failed') {
    return false
  }
  if (isInsufficientGameDownload(job)) {
    return false
  }
  const total = Number(job.totalBytes) || 0
  const done = Number(job.bytesDownloaded) || 0
  if (total >= MIN_READY_DOWNLOAD_BYTES && done < total * 0.995) return false
  if (LIBRARY_JOB_STATUSES.has(job.status)) return true
  // failed de extract com overlay status failed mas bytes ok — já coberto acima
  if (job.status === 'failed' && isDownloadFullyTransferred(job)) return false
  return (
    isDownloadFullyTransferred(job) &&
    ['downloading', 'pending', 'retrying', 'paused'].includes(job.status)
  )
}

export const isJobFinished = (job: DownloadJob) => {
  if (['cancelled'].includes(job.status)) return false
  // failed só conta como finished se a transferência chegou ao fim (extract failed).
  if (job.status === 'failed') {
    return isDownloadFullyTransferred(job) || job.extractionStatus === 'failed'
  }
  if (['extracted', 'completed', 'seeding', 'skipped'].includes(job.status)) {
    // Alinhar com membership: status terminal sem bytes suficientes ≠ finished para path refresh.
    if (
      isInsufficientGameDownload(job) &&
      isTorrentLikeUrl(job.url)
    ) {
      return false
    }
    return true
  }
  if (isDownloadFullyTransferred(job)) return true
  return (
    job.progress >= 99 &&
    !['downloading', 'pending', 'retrying', 'cancelled', 'extracting'].includes(job.status)
  )
}
