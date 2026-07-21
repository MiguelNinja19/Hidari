import type { DownloadJob } from '../types/contracts'
import {
  MIN_READY_DOWNLOAD_BYTES,
  downloadReportedBytes,
  extractionSaysReady,
  hasAwaitingContentMessage,
  isAwaitingTorrentContent,
  isInsufficientGameDownload,
  isTorrentLikeUrl,
} from './torrentContentState'

export function isGameContentReady(job: DownloadJob): boolean {
  if (isInsufficientGameDownload(job)) return false
  if (hasAwaitingContentMessage(job) && downloadReportedBytes(job) < MIN_READY_DOWNLOAD_BYTES) {
    return false
  }
  const total = Number(job.totalBytes) || 0
  const done = Number(job.bytesDownloaded) || 0
  if (
    total >= MIN_READY_DOWNLOAD_BYTES &&
    done < total * 0.995 &&
    ['downloading', 'pending', 'retrying'].includes(job.status)
  ) {
    return false
  }
  if (extractionSaysReady(job)) {
    if (total >= MIN_READY_DOWNLOAD_BYTES && done < total * 0.995) return false
    return true
  }
  if (downloadReportedBytes(job) >= MIN_READY_DOWNLOAD_BYTES) {
    return (
      ['completed', 'seeding', 'extracted', 'skipped'].includes(job.status) &&
      done >= total * 0.995
    )
  }
  return false
}

export function isDownloadFullyTransferred(
  job: Pick<DownloadJob, 'totalBytes' | 'bytesDownloaded' | 'progress'>,
): boolean {
  const total = Number(job.totalBytes) || 0
  const done = Number(job.bytesDownloaded) || 0
  if (total < MIN_READY_DOWNLOAD_BYTES || done < MIN_READY_DOWNLOAD_BYTES) return false
  return done >= total * 0.995
}

export const isTorrentMetadataPhase = (job: DownloadJob) => {
  if (['cancelled', 'failed'].includes(job.status)) return false
  if (isGameContentReady(job)) return false
  if (isAwaitingTorrentContent(job)) return true
  if (isInsufficientGameDownload(job)) return true
  if (!isTorrentLikeUrl(job.url)) return false
  if (!['downloading', 'pending', 'retrying'].includes(job.status)) return false
  return downloadReportedBytes(job) < MIN_READY_DOWNLOAD_BYTES
}

export function shouldShowDownloadPercent(job: DownloadJob): boolean {
  if (['cancelled', 'failed'].includes(job.status)) return false
  if (hasAwaitingContentMessage(job) && downloadReportedBytes(job) < MIN_READY_DOWNLOAD_BYTES) {
    return false
  }
  if (
    isInsufficientGameDownload(job) ||
    isAwaitingTorrentContent(job) ||
    isTorrentMetadataPhase(job)
  ) {
    return false
  }
  if (isGameContentReady(job)) return true
  const size = downloadReportedBytes(job)
  return isTorrentLikeUrl(job.url) ? size >= MIN_READY_DOWNLOAD_BYTES : size > 0
}
