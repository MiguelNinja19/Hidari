import type { DownloadJob } from '../types/contracts'
import { formatEta, formatSize, formatSpeed, jobStatusLabel, showEtaForJob } from './formatters'
import {
  isAwaitingTorrentContent,
  isGameContentReady,
  isInsufficientGameDownload,
  isTorrentMetadataPhase,
} from './jobProgress'

export function downloadRowDetail(job: DownloadJob, downloadNow: number): string {
  void downloadNow

  if (isAwaitingTorrentContent(job) || isTorrentMetadataPhase(job) || isInsufficientGameDownload(job)) {
    const soft = job.errorMsg?.trim() ?? ''
    if (soft.includes('conteúdo') || soft.includes('metadados') || soft.includes('aguardar')) {
      return soft.length < 120 ? soft : 'A obter o conteúdo do torrent…'
    }
    return 'A obter o conteúdo do torrent…'
  }

  const softError = job.errorMsg?.trim() ?? ''
  if (softError.includes('download_failover')) {
    return 'A tentar outra fonte do catálogo…'
  }
  if (softError.includes('download_stalled_recovering')) {
    return 'Sem atividade — a retomar automaticamente…'
  }
  if (softError.includes('download_stalled')) {
    return 'Parado sem velocidade — tente outra fonte'
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
    if (parts.length > 0) return parts.join(' · ')
    if (job.status === 'downloading' && (job.speedBps ?? 0) <= 0) {
      return 'À espera de peers…'
    }
    return 'Transferindo'
  }

  if (job.status === 'extracting') {
    return 'Extraindo arquivos…'
  }

  if (isGameContentReady(job)) {
    return 'Pronto para instalar'
  }

  if (job.status === 'completed' || job.status === 'seeding' || job.status === 'skipped') {
    if (isAwaitingTorrentContent(job) || isInsufficientGameDownload(job)) {
      return 'A obter o conteúdo do torrent…'
    }
    return 'Pronto para instalar'
  }

  return jobStatusLabel(job)
}
