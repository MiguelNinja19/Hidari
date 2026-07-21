import type { DownloadJob, ExtractStatusEvent } from '../../shared/types/contracts'

export function applyExtractStatusEvent(job: DownloadJob, payload: ExtractStatusEvent) {
  const { status, message } = payload

  if (status === 'verified' || status === 'verify_failed') {
    job.extractionStatus = status
    if (status === 'verify_failed' && message) {
      job.errorMsg = message
    }
    return
  }

  if (status === 'skipped') {
    job.extractionStatus = 'skipped'
    // Manter seeding se o torrent ainda estiver a semear.
    if (job.status !== 'seeding') {
      job.status = 'completed'
    }
    const awaiting =
      typeof job.errorMsg === 'string' &&
      /conteúdo do torrent|obter o conteúdo|aguardar|metadados/i.test(job.errorMsg)
    const tiny =
      (job.totalBytes > 0 && job.totalBytes < 5 * 1024 * 1024) ||
      (job.bytesDownloaded > 0 && job.bytesDownloaded < 5 * 1024 * 1024)
    if (awaiting || tiny) {
      job.progress = 0
      job.errorMsg = job.errorMsg?.trim() || 'A obter o conteúdo do torrent…'
    } else {
      job.progress = 100
      if (job.errorMsg && /conteúdo|metadados|aguardar/i.test(job.errorMsg)) {
        job.errorMsg = null
      }
    }
    return
  }

  if (status === 'failed') {
    job.extractionStatus = 'failed'
    if (message) job.errorMsg = message
    // Download já feito: não promover a failed de download (mantém na biblioteca).
    if (!['completed', 'seeding', 'extracted', 'skipped', 'extracting'].includes(job.status)) {
      job.status = 'failed'
    }
    return
  }

  job.status = status
  job.extractionStatus = status
  if (status === 'extracted') job.progress = 100
}
