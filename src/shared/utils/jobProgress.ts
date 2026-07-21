import type { DownloadJob } from '../types/contracts'
import { resolveJobProgressPercentFromFields } from './jobProgressPercent'
import { shouldShowDownloadPercent } from './jobReadiness'

export * from './torrentContentState'
export * from './jobReadiness'
export * from './jobProgressPercent'

export const resolveJobProgressPercent = (job: DownloadJob): number => {
  if (!shouldShowDownloadPercent(job)) return 0
  return resolveJobProgressPercentFromFields({
    progress: job.progress,
    bytesDownloaded: job.bytesDownloaded ?? 0,
    totalBytes: job.totalBytes ?? 0,
    status: job.status,
    url: job.url,
    speedBps: job.speedBps,
    extractionStatus: job.extractionStatus,
    errorMsg: job.errorMsg,
  })
}

export const formatProgressPercent = (job: DownloadJob): string => {
  // Nunca mostrar % do aria em “a obter conteúdo” / metadados.
  if (!shouldShowDownloadPercent(job)) return ''
  const value = resolveJobProgressPercent(job)
  if (value <= 0) return '0%'
  if (value >= 100) return '100%'
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  const text = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1)
  return `${text.replace('.', ',')}%`
}
