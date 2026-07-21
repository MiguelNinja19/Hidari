import type { DownloadJob, JobProgressEvent } from '../../shared/types/contracts'

export function applyJobProgressPercent(job: DownloadJob, payload: JobProgressEvent, merged: DownloadJob) {
  const { progress, status, errorMsg } = payload
  const sizeNow = Math.max(merged.bytesDownloaded ?? 0, merged.totalBytes ?? 0)
  const softAwaiting =
    typeof errorMsg === 'string' &&
    /conteúdo do torrent|obter o conteúdo|aguardar conteúdo|metadados/i.test(errorMsg)
  const stickySoft =
    typeof job.errorMsg === 'string' &&
    /conteúdo do torrent|obter o conteúdo|aguardar conteúdo|metadados/i.test(job.errorMsg)
  const fullyDone =
    (merged.totalBytes ?? 0) >= 5 * 1024 * 1024 &&
    (merged.bytesDownloaded ?? 0) >= (merged.totalBytes ?? 0) * 0.995
  const stillTransferring =
    ['downloading', 'pending', 'retrying'].includes(status) &&
    (merged.totalBytes ?? 0) >= 5 * 1024 * 1024 &&
    (merged.bytesDownloaded ?? 0) < (merged.totalBytes ?? 0) * 0.995

  if (stillTransferring) {
    // Não apagar extract estável por glitch de bytes — só pending_content/verified frágil.
    if (job.extractionStatus === 'verified') {
      job.extractionStatus = null
    }
    job.status = 'downloading'
    job.progress = ((merged.bytesDownloaded ?? 0) / (merged.totalBytes ?? 1)) * 100
  } else if (fullyDone && ['downloading', 'pending', 'retrying', 'seeding'].includes(status)) {
    // Não sobrescrever extracting/extracted.
    if (job.status !== 'extracting' && job.status !== 'extracted') {
      job.status = status === 'seeding' ? 'seeding' : 'completed'
    }
    job.progress = 100
  } else if (
    softAwaiting &&
    sizeNow < 5 * 1024 * 1024 &&
    (status === 'downloading' || status === 'completed' || status === 'seeding')
  ) {
    job.progress = 0
    job.status = 'downloading'
    if (job.extractionStatus === 'skipped' || job.extractionStatus === 'verified') {
      job.extractionStatus = 'pending_content'
    }
    if ((job.totalBytes ?? 0) > 0 && (job.totalBytes ?? 0) < 5 * 1024 * 1024) {
      job.totalBytes = 0
      job.bytesDownloaded = 0
    }
  } else if (
    progress <= 0 &&
    job.progress > 0 &&
    (merged.bytesDownloaded > 0 || merged.totalBytes > 0) &&
    !['cancelled', 'failed'].includes(status)
  ) {
    if (
      (merged.totalBytes ?? 0) >= 5 * 1024 * 1024 ||
      (merged.bytesDownloaded ?? 0) >= 5 * 1024 * 1024
    ) {
      if (stillTransferring || (merged.totalBytes ?? 0) > 0) {
        job.progress =
          (merged.totalBytes ?? 0) > 0
            ? ((merged.bytesDownloaded ?? 0) / (merged.totalBytes ?? 1)) * 100
            : job.progress
      }
    } else {
      job.progress = progress
    }
  } else if (!fullyDone) {
    job.progress =
      (merged.totalBytes ?? 0) >= 5 * 1024 * 1024
        ? ((merged.bytesDownloaded ?? 0) / (merged.totalBytes ?? 1)) * 100
        : progress
  }

  job.updatedAt = new Date().toISOString()
  if (errorMsg != null) job.errorMsg = errorMsg.trim() ? errorMsg : null
  if (sizeNow >= 5 * 1024 * 1024 && (softAwaiting || stickySoft)) {
    job.errorMsg = null
    if (job.extractionStatus === 'pending_content') job.extractionStatus = null
  }
  if (
    fullyDone &&
    typeof job.errorMsg === 'string' &&
    /download_stalled|Sem atividade|retomar automaticamente|stall/i.test(job.errorMsg)
  ) {
    job.errorMsg = null
  }
}
