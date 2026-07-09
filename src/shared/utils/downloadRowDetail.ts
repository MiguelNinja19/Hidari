import type { DownloadJob } from '../types/contracts'
import { formatEta, formatSize, formatSpeed, jobStatusLabel, showEtaForJob } from './formatters'
import { jobNeedsExtraction } from './jobExtraction'
import { isTorrentMetadataPhase } from './jobProgress'

export function downloadRowDetail(job: DownloadJob, downloadNow: number): string {
  void downloadNow

  if (isTorrentMetadataPhase(job)) {
    return 'Obtendo metadados do torrent'
  }

  if (['downloading', 'retrying', 'seeding'].includes(job.status)) {
    const parts: string[] = []
    if ((job.speedBps ?? 0) > 0) {
      parts.push(formatSpeed(job.speedBps))
    }
    if (job.totalBytes > 0) {
      parts.push(`${formatSize(job.bytesDownloaded)} / ${formatSize(job.totalBytes)}`)
    } else if (job.bytesDownloaded > 0) {
      parts.push(formatSize(job.bytesDownloaded))
    }
    const eta = showEtaForJob(job) ? formatEta(job.etaSeconds) : null
    if (eta) {
      parts.push(eta)
    }
    return parts.length > 0 ? parts.join(' · ') : 'Transferindo'
  }

  if (job.status === 'extracting') {
    return 'Extraindo arquivos…'
  }

  if ((job.status === 'completed' || job.status === 'seeding') && jobNeedsExtraction(job)) {
    return 'Preparando arquivos…'
  }

  if (job.status === 'completed' && job.extractionStatus === 'skipped') {
    return 'Pronto para instalar'
  }

  return jobStatusLabel(job)
}
