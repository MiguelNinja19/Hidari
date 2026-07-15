import { resolveDeletePath } from '../../shared/utils/archive'
import { activeJobBlocksLibraryFolder } from '../../shared/utils/jobExtraction'
import {
  isInsufficientGameDownload,
  isAwaitingTorrentContent,
  isTorrentMetadataPhase,
  isDownloadFullyTransferred,
  resolveJobProgressPercent,
  MIN_READY_DOWNLOAD_BYTES,
} from '../../shared/utils/jobProgress'
import type { DownloadJob, LibraryPathState } from '../../shared/types/contracts'
import type { LibraryEntry } from './types'

export const pathStateKey = (
  path: string,
  ctx?: { jobId?: string; title?: string },
) => {
  if (ctx?.jobId) return `job:${ctx.jobId}`
  const base = resolveDeletePath(path).toLowerCase()
  if (ctx?.title) return `${base}::${ctx.title.trim().toLowerCase()}`
  return base
}

export const getPathState = (
  path: string,
  pathStateByKey: Record<string, LibraryPathState>,
  ctx?: { jobId?: string; title?: string },
) => pathStateByKey[pathStateKey(path, ctx)]

export const isPathStateResolved = (
  item: LibraryEntry,
  pathStateByKey: Record<string, LibraryPathState>,
) => getPathState(item.destPath, pathStateByKey, itemPathCtx(item)) !== undefined

export const jobPathCtx = (job: DownloadJob) => ({ jobId: job.id, title: job.title })

export const itemPathCtx = (item: LibraryEntry) => ({
  jobId: item.kind === 'job' ? item.id : undefined,
  title: item.title,
})

const itemHasGame = (
  path: string,
  pathStateByKey: Record<string, LibraryPathState>,
  ctx?: { jobId?: string; title?: string },
) => {
  const state = getPathState(path, pathStateByKey, ctx)
  return state?.hasGame === true || state?.playable === true
}

export const needsInstallItem = (
  item: LibraryEntry,
  pathStateByKey: Record<string, LibraryPathState>,
) => {
  const state = getPathState(item.destPath, pathStateByKey, itemPathCtx(item))
  return state?.needsInstall === true
}

const ACTIVE_QUEUE_STATUSES = new Set(['downloading', 'pending', 'retrying', 'paused'])

const LIBRARY_JOB_STATUSES = new Set([
  'completed',
  'seeding',
  'extracting',
  'extracted',
  'skipped',
  // Download terminou; falha só na verificação não deve esconder o jogo.
  'verify_failed',
])

/** Job ainda na fila de downloads — não deve aparecer na biblioteca. */
export function isActiveQueueJob(job: DownloadJob): boolean {
  return ACTIVE_QUEUE_STATUSES.has(job.status)
}

/** Transferência do jogo efectivamente concluída (≥5 MiB e ~100% dos bytes). */
export { isDownloadFullyTransferred } from '../../shared/utils/jobProgress'

/** Só entra na biblioteca quando o download do JOGO terminou (não metadados ~KB). */
export function jobBelongsInLibrary(job: DownloadJob): boolean {
  if (isInsufficientGameDownload(job)) return false
  if (isAwaitingTorrentContent(job)) return false
  if (isTorrentMetadataPhase(job)) return false

  const total = Number(job.totalBytes) || 0
  const done = Number(job.bytesDownloaded) || 0
  // Ainda a meio (ex.: 1 GB / 2 GB) → NUNCA na Biblioteca, mesmo com status completed/skipped.
  if (total >= MIN_READY_DOWNLOAD_BYTES && done < total * 0.995) {
    return false
  }

  if (LIBRARY_JOB_STATUSES.has(job.status)) return true
  // 100% real: downloading (seed) OU paused após fecho/manual — senão some da Biblioteca.
  if (
    isDownloadFullyTransferred(job) &&
    ['downloading', 'pending', 'retrying', 'paused'].includes(job.status)
  ) {
    return true
  }
  return false
}

export const isJobFinished = (job: DownloadJob) => {
  if (['cancelled', 'failed'].includes(job.status)) return false
  if (
    job.status === 'extracted' ||
    job.status === 'completed' ||
    job.status === 'seeding' ||
    job.status === 'skipped'
  ) {
    return true
  }
  // Paused (ou similar) com bytes a 100% — download concluído, não “em curso”.
  if (isDownloadFullyTransferred(job)) return true
  return (
    job.progress >= 99 &&
    !['downloading', 'pending', 'retrying', 'cancelled', 'extracting'].includes(job.status)
  )
}

export const isPlayableLibraryItem = (
  item: LibraryEntry,
  allJobs: DownloadJob[],
  pathStateByKey: Record<string, LibraryPathState>,
  defaultDownloadPath = '',
) => {
  if (needsInstallItem(item, pathStateByKey)) return false

  const hasGame = itemHasGame(item.destPath, pathStateByKey, itemPathCtx(item))
  if (!hasGame) return false

  if (item.kind === 'job') {
    return true
  }

  const folderPath = item.destPath
  const blockedByActiveJob = allJobs.some(
    (job) =>
      job.status !== 'extracted' &&
      job.status !== 'cancelled' &&
      !itemHasGame(job.destPath, pathStateByKey, jobPathCtx(job)) &&
      activeJobBlocksLibraryFolder(folderPath, job.destPath, defaultDownloadPath),
  )
  return !blockedByActiveJob
}

export const itemAwaitingInstall = (
  item: LibraryEntry,
  allJobs: DownloadJob[],
  pathStateByKey: Record<string, LibraryPathState>,
) => {
  if (isPlayableLibraryItem(item, allJobs, pathStateByKey)) return false

  const state = getPathState(item.destPath, pathStateByKey, itemPathCtx(item))
  if (state?.needsInstall) return true

  if (item.kind === 'job') {
    if (
      ['downloading', 'pending', 'retrying', 'extracting', 'cancelled'].includes(
        item.status,
      ) &&
      !(item.job && isJobFinished(item.job))
    ) {
      return false
    }
    // Pausado a meio = ainda não instalar; pausado a 100% = download feito.
    if (item.status === 'paused' && !(item.job && isJobFinished(item.job))) {
      return false
    }
    if (
      item.status === 'extracted' ||
      item.status === 'completed' ||
      item.status === 'seeding' ||
      item.status === 'skipped' ||
      item.status === 'paused' ||
      (item.job && isJobFinished(item.job))
    ) {
      return !itemHasGame(item.destPath, pathStateByKey, itemPathCtx(item))
    }
  }

  return false
}

export const showPlayAction = (
  item: LibraryEntry,
  jobs: DownloadJob[],
  pathStateByKey: Record<string, LibraryPathState>,
) => isPlayableLibraryItem(item, jobs, pathStateByKey)

export const showInstallAction = (
  item: LibraryEntry,
  jobs: DownloadJob[],
  pathStateByKey: Record<string, LibraryPathState>,
) => itemAwaitingInstall(item, jobs, pathStateByKey)

export const showLocateInstallAction = (
  item: LibraryEntry,
  jobs: DownloadJob[],
  pathStateByKey: Record<string, LibraryPathState>,
) => {
  if (!isPathStateResolved(item, pathStateByKey)) return false
  if (showPlayAction(item, jobs, pathStateByKey)) return false
  if (itemAwaitingInstall(item, jobs, pathStateByKey)) return false
  if (item.kind === 'job' && item.job && !isJobFinished(item.job)) return false
  return true
}

export const hasManualInstallRoot = (
  item: LibraryEntry,
  pathStateByKey: Record<string, LibraryPathState>,
) => {
  const state = getPathState(item.destPath, pathStateByKey, itemPathCtx(item))
  return Boolean(state?.customGameRoot?.trim())
}

export type LibraryStatusMeta = {
  tone: string
  labelKey: string
  pct?: number
}

export function libraryStatusMeta(
  item: LibraryEntry,
  jobs: DownloadJob[],
  pathStateByKey: Record<string, LibraryPathState>,
  ctx?: { installing?: boolean },
): LibraryStatusMeta {
  const state = getPathState(item.destPath, pathStateByKey, itemPathCtx(item))
  const resolved = state !== undefined

  if (ctx?.installing) {
    return { labelKey: 'library.status.installing', tone: 'installing' }
  }

  if (!resolved) {
    if (item.kind === 'folder') {
      return { labelKey: 'library.status.verifying', tone: 'verifying' }
    }
    if (item.kind === 'job' && item.job && isJobFinished(item.job)) {
      return { labelKey: 'library.status.verifying', tone: 'verifying' }
    }
  }

  if (itemAwaitingInstall(item, jobs, pathStateByKey)) {
    return { labelKey: 'library.status.install', tone: 'waiting' }
  }
  if (state?.needsExtraction) {
    return { labelKey: 'library.status.preparing', tone: 'verifying' }
  }
  if (state?.hasGame || state?.playable || isPlayableLibraryItem(item, jobs, pathStateByKey)) {
    return { labelKey: 'library.status.play', tone: 'ready' }
  }
  if (item.kind === 'folder') {
    return { labelKey: 'library.status.inLibrary', tone: 'idle' }
  }
  if (
    item.status === 'downloading' ||
    item.status === 'pending' ||
    item.status === 'retrying'
  ) {
    const asJob: DownloadJob = item.job ?? {
      id: item.id,
      title: item.title,
      url: '',
      destPath: item.destPath,
      status: item.status,
      priority: 0,
      progress: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      errorMsg: null,
      createdAt: '',
      updatedAt: '',
    }
    if (isTorrentMetadataPhase(asJob)) {
      return { labelKey: 'library.status.connectingPeers', tone: 'downloading' }
    }
    const pct = resolveJobProgressPercent(asJob)
    if (pct > 0 && pct < 100) {
      return {
        labelKey: 'library.status.downloadingPct',
        tone: 'downloading',
        pct,
      }
    }
    if (pct >= 100) {
      return {
        labelKey: 'library.status.downloadingPct',
        tone: 'downloading',
        pct: 100,
      }
    }
    return { labelKey: 'library.status.downloading', tone: 'downloading' }
  }
  if (item.status === 'paused') {
    return { labelKey: 'library.status.paused', tone: 'paused' }
  }
  if (item.status === 'failed') {
    return { labelKey: 'library.status.failed', tone: 'failed' }
  }
  return { labelKey: 'library.status.waiting', tone: 'idle' }
}
