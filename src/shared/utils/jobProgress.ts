import type { DownloadJob } from '../types/contracts'

/** Abaixo disto NÃO é o jogo — só metadados/.torrent/lixo. */
export const MIN_READY_DOWNLOAD_BYTES = 5 * 1024 * 1024

/** @deprecated use MIN_READY_DOWNLOAD_BYTES */
export const TORRENT_METADATA_MAX_BYTES = MIN_READY_DOWNLOAD_BYTES

export function isTorrentLikeUrl(url: string): boolean {
  const lower = url.trim().toLowerCase()
  return lower.startsWith('magnet:') || lower.includes('.torrent')
}

export function downloadReportedBytes(job: Pick<DownloadJob, 'totalBytes' | 'bytesDownloaded'>): number {
  const total = Number(job.totalBytes) || 0
  const done = Number(job.bytesDownloaded) || 0
  return Math.max(total, done)
}

function extractionSaysReady(
  job: Pick<DownloadJob, 'status'> & { extractionStatus?: string | null },
): boolean {
  if (['extracted', 'skipped'].includes(job.status)) return true
  const extraction = job.extractionStatus?.trim()
  return extraction === 'skipped' || extraction === 'extracted' || extraction === 'verified'
}

/** Mensagem/estado de “ainda a obter o jogo”, não metadados concluídos. */
export function hasAwaitingContentMessage(job: Pick<DownloadJob, 'errorMsg'>): boolean {
  const soft = (job.errorMsg ?? '').toLowerCase()
  return (
    soft.includes('conteúdo do torrent') ||
    soft.includes('obter o conteúdo') ||
    soft.includes('aguardar conteúdo') ||
    soft.includes('metadados ok') ||
    soft.includes('a obter metadados') ||
    soft.includes('a obter o conteúdo') ||
    soft.includes('metadados do torrent')
  )
}

/**
 * Payload demasiado pequeno (6 KB, etc.).
 * Tem prioridade sobre skipped/extracted — senão aparece 100% + “a obter conteúdo”.
 */
export function isInsufficientGameDownload(
  job: Pick<DownloadJob, 'url' | 'totalBytes' | 'bytesDownloaded' | 'status'> & {
    extractionStatus?: string | null
    progress?: number
    errorMsg?: string | null
  },
): boolean {
  const size = downloadReportedBytes(job)
  if (size > 0 && size < MIN_READY_DOWNLOAD_BYTES) return true
  return false
}

export function isTinyTorrentPayload(
  job: Pick<DownloadJob, 'url' | 'totalBytes' | 'bytesDownloaded' | 'status'> & {
    extractionStatus?: string | null
    progress?: number
    errorMsg?: string | null
  },
): boolean {
  return isInsufficientGameDownload(job)
}

/**
 * Ainda a obter metadados/conteúdo — NÃO mostrar %.
 * Se já há bytes reais do jogo (≥5 MiB), a mensagem soft “A obter…” NÃO conta
 * (fica sticky no Redux/DB e bloqueava Biblioteca + Instalar).
 */
export function isAwaitingTorrentContent(
  job: Pick<DownloadJob, 'errorMsg' | 'totalBytes' | 'bytesDownloaded' | 'status' | 'url'> & {
    extractionStatus?: string | null
  },
): boolean {
  if (isInsufficientGameDownload(job)) return true

  const size = downloadReportedBytes(job)
  if (size >= MIN_READY_DOWNLOAD_BYTES) return false

  if (hasAwaitingContentMessage(job)) return true

  // Torrents sem tamanho real ainda não têm % útil.
  if (isTorrentLikeUrl(job.url) && size <= 0 && !extractionSaysReady(job)) {
    return ['downloading', 'pending', 'retrying', 'seeding', 'completed'].includes(job.status)
  }
  return false
}

/** Conteúdo do jogo confirmado o suficiente para 100% / Instalar. */
export function isGameContentReady(job: DownloadJob): boolean {
  if (isInsufficientGameDownload(job)) return false
  // Soft “A obter…” só bloqueia enquanto o payload for pequeno / desconhecido.
  if (hasAwaitingContentMessage(job) && downloadReportedBytes(job) < MIN_READY_DOWNLOAD_BYTES) {
    return false
  }

  const total = Number(job.totalBytes) || 0
  const done = Number(job.bytesDownloaded) || 0
  // Ainda a baixar de verdade (ex.: 1 GB / 2 GB) — NÃO está pronto,
  // mesmo que extractionStatus=skipped de um falso “completo” de metadados.
  if (
    total >= MIN_READY_DOWNLOAD_BYTES &&
    done < total * 0.995 &&
    ['downloading', 'pending', 'retrying'].includes(job.status)
  ) {
    return false
  }

  if (extractionSaysReady(job)) {
    if (total >= MIN_READY_DOWNLOAD_BYTES && done < total * 0.995) return false
    return true
  }
  const size = downloadReportedBytes(job)
  if (size >= MIN_READY_DOWNLOAD_BYTES) {
    return (
      ['completed', 'seeding', 'extracted', 'skipped'].includes(job.status) &&
      done >= total * 0.995
    )
  }
  return false
}

/** Transferência do jogo efectivamente concluída (≥5 MiB e ~100% dos bytes). */
export function isDownloadFullyTransferred(
  job: Pick<DownloadJob, 'totalBytes' | 'bytesDownloaded' | 'progress'>,
): boolean {
  const total = Number(job.totalBytes) || 0
  const done = Number(job.bytesDownloaded) || 0
  if (total < MIN_READY_DOWNLOAD_BYTES || done < MIN_READY_DOWNLOAD_BYTES) return false
  // Só bytes — nunca o progress sticky do aria (ex.: 100% com 1 GB/2 GB).
  return done >= total * 0.995
}

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

/** % só a partir de bytes do conteúdo — nunca do progress “cru” do aria em torrent. */
export function resolveJobProgressPercentFromFields(input: ProgressFields): number {
  const { progress, bytesDownloaded, totalBytes, status, url, extractionStatus, errorMsg } = input

  if (
    isInsufficientGameDownload({
      url,
      totalBytes,
      bytesDownloaded,
      status,
      extractionStatus,
      errorMsg,
    })
  ) {
    return 0
  }
  if (
    isAwaitingTorrentContent({
      url,
      totalBytes,
      bytesDownloaded,
      status,
      extractionStatus,
      errorMsg,
    })
  ) {
    return 0
  }

  // Durante a transferência, % SEMPRE pelos bytes — nunca skipped/aria a 100% falso.
  if (totalBytes >= MIN_READY_DOWNLOAD_BYTES) {
    const bytePct = (Math.max(0, bytesDownloaded) / totalBytes) * 100
    if (bytesDownloaded >= totalBytes * 0.995) {
      if (['seeding', 'completed', 'extracted', 'skipped'].includes(status)) return 100
      if (['downloading', 'pending', 'retrying'].includes(status)) return 100
    }
    if (['downloading', 'pending', 'retrying'].includes(status)) {
      return Math.min(99.9, Math.max(0, bytePct))
    }
  }

  if (isGameContentReady({
    id: '',
    title: '',
    url,
    destPath: '',
    status,
    priority: 0,
    progress,
    bytesDownloaded,
    totalBytes,
    errorMsg: errorMsg ?? null,
    extractionStatus: extractionStatus ?? null,
    createdAt: '',
    updatedAt: '',
  })) {
    return 100
  }

  if (totalBytes >= MIN_READY_DOWNLOAD_BYTES) {
    const bytePct = (Math.max(0, bytesDownloaded) / totalBytes) * 100
    return Math.min(99.9, Math.max(0, bytePct))
  }

  if (status === 'extracting') return 100

  // Sem tamanho real: torrents não usam % do aria.
  if (isTorrentLikeUrl(url)) return 0

  if (!Number.isFinite(progress) || progress < 0) return 0
  if (progress > 0 && progress < 1) return progress * 100
  return Math.min(100, progress)
}

export const isTorrentMetadataPhase = (job: DownloadJob) => {
  if (['cancelled', 'failed'].includes(job.status)) return false
  if (isGameContentReady(job)) return false
  if (isAwaitingTorrentContent(job)) return true
  if (isInsufficientGameDownload(job)) return true
  if (!isTorrentLikeUrl(job.url)) return false
  if (!['downloading', 'pending', 'retrying'].includes(job.status)) return false
  return downloadReportedBytes(job) < MIN_READY_DOWNLOAD_BYTES
}

/**
 * Mostrar número de % só com transferência real do jogo.
 * Metadados / “a obter conteúdo” → string vazia (sem 0% nem 100%).
 */
export function shouldShowDownloadPercent(job: DownloadJob): boolean {
  if (['cancelled', 'failed'].includes(job.status)) return false
  // Soft “a obter” só esconde % enquanto o payload for pequeno.
  if (hasAwaitingContentMessage(job) && downloadReportedBytes(job) < MIN_READY_DOWNLOAD_BYTES) {
    return false
  }
  if (isInsufficientGameDownload(job)) return false
  if (isAwaitingTorrentContent(job)) return false
  if (isTorrentMetadataPhase(job)) return false

  if (isGameContentReady(job)) return true

  const size = downloadReportedBytes(job)
  if (isTorrentLikeUrl(job.url)) {
    return size >= MIN_READY_DOWNLOAD_BYTES
  }
  return size > 0
}

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
