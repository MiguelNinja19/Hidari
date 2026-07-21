import type { DownloadJob } from '../types/contracts'

export const MIN_READY_DOWNLOAD_BYTES = 5 * 1024 * 1024
export const TORRENT_METADATA_MAX_BYTES = MIN_READY_DOWNLOAD_BYTES

export function isTorrentLikeUrl(url: string): boolean {
  const lower = url.trim().toLowerCase()
  return lower.startsWith('magnet:') || lower.includes('.torrent')
}

export function downloadReportedBytes(
  job: Pick<DownloadJob, 'totalBytes' | 'bytesDownloaded'>,
): number {
  return Math.max(Number(job.totalBytes) || 0, Number(job.bytesDownloaded) || 0)
}

export function extractionSaysReady(
  job: Pick<DownloadJob, 'status'> & { extractionStatus?: string | null },
): boolean {
  if (['extracted', 'skipped'].includes(job.status)) return true
  const extraction = job.extractionStatus?.trim()
  // verified = passo intermédio (ainda pode precisar extract) — não é “pronto”.
  return extraction === 'skipped' || extraction === 'extracted'
}

export function hasAwaitingContentMessage(job: Pick<DownloadJob, 'errorMsg'>): boolean {
  const soft = (job.errorMsg ?? '').toLowerCase()
  return [
    'conteúdo do torrent',
    'obter o conteúdo',
    'aguardar conteúdo',
    'metadados ok',
    'a obter metadados',
    'a obter o conteúdo',
    'metadados do torrent',
  ].some((message) => soft.includes(message))
}

export function isInsufficientGameDownload(
  job: Pick<DownloadJob, 'url' | 'totalBytes' | 'bytesDownloaded' | 'status'> & {
    extractionStatus?: string | null
    progress?: number
    errorMsg?: string | null
  },
): boolean {
  const size = downloadReportedBytes(job)
  if (!(size > 0 && size < MIN_READY_DOWNLOAD_BYTES)) return false
  // HTTP/ficheiros pequenos completos não são “metadados de torrent”.
  if (!isTorrentLikeUrl(job.url)) return false
  return true
}

export const isTinyTorrentPayload = isInsufficientGameDownload

export function isAwaitingTorrentContent(
  job: Pick<DownloadJob, 'errorMsg' | 'totalBytes' | 'bytesDownloaded' | 'status' | 'url'> & {
    extractionStatus?: string | null
  },
): boolean {
  if (isInsufficientGameDownload(job)) return true
  const size = downloadReportedBytes(job)
  if (size >= MIN_READY_DOWNLOAD_BYTES) return false
  if (hasAwaitingContentMessage(job)) return true
  if (isTorrentLikeUrl(job.url) && size <= 0 && !extractionSaysReady(job)) {
    return ['downloading', 'pending', 'retrying', 'seeding', 'completed'].includes(job.status)
  }
  return false
}
