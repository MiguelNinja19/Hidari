import type { DownloadJob } from '../../shared/types/contracts'
import { isTorrentMetadataPhase } from './jobProgress'

export function formatSpeed(speedBytesPerSec?: number) {
  const speed = speedBytesPerSec ?? 0
  if (speed >= 1024 * 1024) return `${(speed / (1024 * 1024)).toFixed(1)} MB/s`
  if (speed >= 1024) return `${(speed / 1024).toFixed(1)} KB/s`
  return `${speed} B/s`
}

export function formatSize(bytes?: number) {
  const value = bytes ?? 0
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

export function formatEta(seconds?: number) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null
  if (seconds > 86400 * 2) return null
  const s = Math.floor(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

export function jobStatusLabel(job: DownloadJob) {
  if (isTorrentMetadataPhase(job)) return 'Conectando peers'
  switch (job.status) {
    case 'pending':
      return 'Na fila'
    case 'downloading':
      return 'Transferindo'
    case 'seeding':
      return 'Completo · a semear'
    case 'retrying':
      return 'Tentando novamente'
    case 'paused':
      return 'Pausado'
    case 'completed':
      return 'Concluído'
    case 'extracting':
      return 'Processando'
    case 'extracted':
      return 'Instalado'
    case 'failed':
      return 'Falhou'
    case 'skipped':
      return 'Pronto'
    case 'cancelled':
      return 'Cancelado'
    default:
      return job.status
  }
}

export function showEtaForJob(job: DownloadJob) {
  if (isTorrentMetadataPhase(job)) return false
  if (job.status !== 'downloading' && job.status !== 'retrying') return false
  const eta = job.etaSeconds
  return eta != null && Number.isFinite(eta) && eta > 0 && eta < 86400 * 2
}
