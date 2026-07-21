import type { DownloadJob } from '../types/contracts'
import { isGameContentReady } from './jobReadiness'
import {
  MIN_READY_DOWNLOAD_BYTES,
  isAwaitingTorrentContent,
  isInsufficientGameDownload,
  isTorrentLikeUrl,
} from './torrentContentState'

export type ProgressFields = {
  progress: number
  bytesDownloaded: number
  totalBytes: number
  status: string
  url: string
  speedBps?: number
  extractionStatus?: string | null
  errorMsg?: string | null
}

export function resolveJobProgressPercentFromFields(input: ProgressFields): number {
  const { progress, bytesDownloaded, totalBytes, status, url, extractionStatus, errorMsg } = input
  const state = {
    url,
    totalBytes,
    bytesDownloaded,
    status,
    extractionStatus,
    errorMsg: errorMsg ?? null,
  }
  if (isInsufficientGameDownload(state) || isAwaitingTorrentContent(state)) return 0

  if (totalBytes >= MIN_READY_DOWNLOAD_BYTES) {
    const bytePct = (Math.max(0, bytesDownloaded) / totalBytes) * 100
    if (
      bytesDownloaded >= totalBytes * 0.995 &&
      ['seeding', 'completed', 'extracted', 'skipped', 'downloading', 'pending', 'retrying'].includes(
        status,
      )
    ) {
      return 100
    }
    if (['downloading', 'pending', 'retrying'].includes(status)) {
      return Math.min(99.9, Math.max(0, bytePct))
    }
  }

  const job: DownloadJob = {
    id: '',
    title: '',
    destPath: '',
    priority: 0,
    createdAt: '',
    updatedAt: '',
    progress,
    bytesDownloaded,
    totalBytes,
    status,
    url,
    errorMsg: errorMsg ?? null,
    extractionStatus: extractionStatus ?? null,
  }
  if (isGameContentReady(job)) return 100
  if (totalBytes >= MIN_READY_DOWNLOAD_BYTES) {
    const bytePct = (Math.max(0, bytesDownloaded) / totalBytes) * 100
    return Math.min(99.9, Math.max(0, bytePct))
  }
  if (status === 'extracting') return 100
  if (isTorrentLikeUrl(url)) return 0
  if (!Number.isFinite(progress) || progress < 0) return 0
  if (progress > 0 && progress < 1) return progress * 100
  return Math.min(100, progress)
}
