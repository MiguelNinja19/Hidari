import type { DownloadJob } from '../types/contracts'

export const isMagnetJob = (job: DownloadJob) => job.url.toLowerCase().startsWith('magnet:')

const TERMINAL_STATUSES = new Set(['completed', 'seeding', 'extracted', 'skipped'])

/** Converte fração 0–1 ou percentagem 0–100 para 0–100. */
export const coerceProgressToPercent = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) return 0
  if (value > 0 && value < 1) return value * 100
  return Math.min(100, value)
}

export type ProgressFields = {
  progress: number
  bytesDownloaded: number
  totalBytes: number
  status: string
  url: string
  speedBps?: number
}

export const hasReliableByteProgress = (bytesDownloaded: number, totalBytes: number) =>
  totalBytes > 0 && bytesDownloaded >= 0

export function resolveJobProgressPercentFromFields(input: ProgressFields): number {
  const { progress, bytesDownloaded, totalBytes, status, url, speedBps = 0 } = input
  const magnet = url.toLowerCase().startsWith('magnet:')
  const active = ['downloading', 'pending', 'retrying', 'paused'].includes(status)

  if (TERMINAL_STATUSES.has(status)) return 100
  if (status === 'extracting') return 100

  if (totalBytes > 0 && bytesDownloaded > 0) {
    if (bytesDownloaded >= totalBytes && (status === 'seeding' || status === 'completed')) {
      return 100
    }
    const bytePct = (bytesDownloaded / totalBytes) * 100
    return Math.min(99.9, Math.max(0, bytePct))
  }

  let server = coerceProgressToPercent(progress)
  if (progress > 0 && progress <= 1 && progress >= 0.999) {
    server = 100
  }

  if (magnet && active && bytesDownloaded <= 0 && totalBytes <= 0) {
    if (server >= 99) return 0
    if (server > 0 && server < 99 && speedBps > 0) return server
    if (server > 0 && server < 99) return server
    return 0
  }

  if (active && server >= 100 && bytesDownloaded <= 0) {
    return 0
  }

  if (active && server >= 100 && totalBytes > 0 && bytesDownloaded < totalBytes) {
    return Math.min(99, (bytesDownloaded / totalBytes) * 100)
  }

  return Math.max(0, Math.min(100, server))
}

export const hasTransferActivity = (job: DownloadJob) => {
  if ((job.bytesDownloaded ?? 0) > 0) return true
  if ((job.totalBytes ?? 0) > 0 && (job.speedBps ?? 0) > 0) return true
  if ((job.speedBps ?? 0) > 0) return true
  const pct = resolveJobProgressPercentFromFields({
    progress: job.progress,
    bytesDownloaded: job.bytesDownloaded ?? 0,
    totalBytes: job.totalBytes ?? 0,
    status: job.status,
    url: job.url,
    speedBps: job.speedBps,
  })
  return pct > 0 && pct < 100
}

export const isTorrentMetadataPhase = (job: DownloadJob) => {
  if (!isMagnetJob(job)) return false
  if (!['downloading', 'pending', 'retrying'].includes(job.status)) return false
  if ((job.bytesDownloaded ?? 0) > 0) return false
  if ((job.totalBytes ?? 0) > 0 && (job.speedBps ?? 0) > 0) return false
  if ((job.speedBps ?? 0) > 0) return false

  const pct = resolveJobProgressPercentFromFields({
    progress: job.progress,
    bytesDownloaded: job.bytesDownloaded ?? 0,
    totalBytes: job.totalBytes ?? 0,
    status: job.status,
    url: job.url,
    speedBps: job.speedBps,
  })
  return pct <= 0
}

export const isActivelyTransferring = (job: DownloadJob) => hasTransferActivity(job)

export const resolveJobProgressPercent = (job: DownloadJob): number =>
  resolveJobProgressPercentFromFields({
    progress: job.progress,
    bytesDownloaded: job.bytesDownloaded ?? 0,
    totalBytes: job.totalBytes ?? 0,
    status: job.status,
    url: job.url,
    speedBps: job.speedBps,
  })

export const formatProgressPercent = (job: DownloadJob): string => {
  if (isTorrentMetadataPhase(job)) return '0%'
  const value = resolveJobProgressPercent(job)
  if (value <= 0) return '0%'
  if (value >= 100) return '100%'
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  const text = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1)
  return `${text.replace('.', ',')}%`
}

const formatElapsedSince = (iso: string, nowMs: number): string => {
  const start = Date.parse(iso)
  if (!Number.isFinite(start)) return '0s'
  const secs = Math.max(0, Math.floor((nowMs - start) / 1000))
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`
}

export const metadataPhaseDetail = (job: DownloadJob, nowMs: number): string => {
  const elapsed = formatElapsedSince(job.updatedAt || job.createdAt, nowMs)
  const secs = Math.max(
    0,
    Math.floor((nowMs - Date.parse(job.updatedAt || job.createdAt)) / 1000),
  )
  if (secs < 20) return `Trackers · ${elapsed}`
  if (secs < 90) return `Peers · ${elapsed}`
  return `Metadados · ${elapsed}`
}
