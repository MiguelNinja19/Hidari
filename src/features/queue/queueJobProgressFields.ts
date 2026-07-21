import type { DownloadJob, JobProgressEvent } from '../../shared/types/contracts'

export function mergeJobProgressFields(job: DownloadJob, payload: JobProgressEvent): DownloadJob {
  const { progress, status, speedBytesPerSec, etaSeconds, bytesDownloaded, totalBytes } = payload
  const merged: DownloadJob = {
    ...job,
    status,
    progress,
    speedBps: speedBytesPerSec,
    etaSeconds,
    bytesDownloaded: bytesDownloaded ?? job.bytesDownloaded,
    totalBytes: totalBytes ?? job.totalBytes,
  }

  if (
    bytesDownloaded != null &&
    bytesDownloaded === 0 &&
    job.bytesDownloaded > 0 &&
    !['cancelled', 'failed'].includes(status)
  ) {
    merged.bytesDownloaded = job.bytesDownloaded
  }
  if (
    totalBytes != null &&
    totalBytes === 0 &&
    job.totalBytes > 0 &&
    !['cancelled', 'failed'].includes(status)
  ) {
    merged.totalBytes = job.totalBytes
  }
  if (
    bytesDownloaded != null &&
    bytesDownloaded > 0 &&
    job.bytesDownloaded > bytesDownloaded &&
    !['cancelled', 'failed'].includes(status)
  ) {
    merged.bytesDownloaded = Math.max(job.bytesDownloaded, bytesDownloaded)
  }
  if (
    totalBytes != null &&
    totalBytes > 0 &&
    job.totalBytes > totalBytes &&
    !['cancelled', 'failed'].includes(status)
  ) {
    merged.totalBytes = Math.max(job.totalBytes, totalBytes)
  }

  job.status = merged.status
  job.speedBps = merged.speedBps
  job.etaSeconds = merged.etaSeconds
  job.bytesDownloaded = merged.bytesDownloaded
  job.totalBytes = merged.totalBytes
  return merged
}
