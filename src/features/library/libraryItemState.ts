import { resolveDeletePath } from '../../shared/utils/archive'
import { activeJobBlocksLibraryFolder } from '../../shared/utils/jobExtraction'
import {
  isTorrentMetadataPhase,
  resolveJobProgressPercent,
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

export const itemHasGame = (
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

export const jobNeedsInstall = (
  job: DownloadJob,
  pathStateByKey: Record<string, LibraryPathState>,
) => {
  const state = getPathState(job.destPath, pathStateByKey, jobPathCtx(job))
  return state?.needsInstall === true
}

const ACTIVE_QUEUE_STATUSES = new Set(['downloading', 'pending', 'retrying', 'paused'])

const LIBRARY_JOB_STATUSES = new Set([
  'completed',
  'seeding',
  'extracting',
  'extracted',
  'skipped',
])

/** Job ainda na fila de downloads — não deve aparecer na biblioteca. */
export function isActiveQueueJob(job: DownloadJob): boolean {
  return ACTIVE_QUEUE_STATUSES.has(job.status)
}

/** Só entra na biblioteca quando o download terminou (pronto para instalar/jogar). */
export function jobBelongsInLibrary(job: DownloadJob): boolean {
  return LIBRARY_JOB_STATUSES.has(job.status)
}

export const isJobFinished = (job: DownloadJob) =>
  job.status === 'extracted' ||
  job.status === 'completed' ||
  job.status === 'seeding' ||
  job.status === 'skipped' ||
  (job.progress >= 99 &&
    !['downloading', 'pending', 'retrying', 'cancelled', 'extracting'].includes(job.status))

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
      ['downloading', 'pending', 'retrying', 'extracting', 'paused', 'cancelled'].includes(
        item.status,
      )
    ) {
      return false
    }
    if (
      item.status === 'extracted' ||
      item.status === 'completed' ||
      item.status === 'seeding' ||
      item.status === 'skipped' ||
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

export function libraryStatusMeta(
  item: LibraryEntry,
  jobs: DownloadJob[],
  pathStateByKey: Record<string, LibraryPathState>,
): { label: string; tone: string } {
  const state = getPathState(item.destPath, pathStateByKey, itemPathCtx(item))
  const resolved = state !== undefined

  if (!resolved) {
    if (item.kind === 'folder') {
      return { label: 'A verificar…', tone: 'idle' }
    }
    if (item.kind === 'job' && item.job && isJobFinished(item.job)) {
      return { label: 'A verificar…', tone: 'idle' }
    }
  }

  if (itemAwaitingInstall(item, jobs, pathStateByKey)) {
    return { label: 'Instalar', tone: 'waiting' }
  }
  if (state?.needsExtraction) {
    return { label: 'Preparando arquivos…', tone: 'idle' }
  }
  if (state?.hasGame || state?.playable || isPlayableLibraryItem(item, jobs, pathStateByKey)) {
    return { label: 'Jogar', tone: 'ready' }
  }
  if (item.kind === 'folder') {
    return { label: 'Na biblioteca', tone: 'idle' }
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
      return { label: 'Conectando peers', tone: 'downloading' }
    }
    const pct = resolveJobProgressPercent(asJob)
    const pctLabel =
      pct > 0 && pct < 100 ? `${pct.toFixed(1).replace('.', ',')}%` : pct >= 100 ? '100%' : ''
    return {
      label: pctLabel ? `Transferindo · ${pctLabel}` : 'Transferindo',
      tone: 'downloading',
    }
  }
  if (item.status === 'paused') {
    return { label: 'Pausado', tone: 'paused' }
  }
  if (item.status === 'failed') {
    return { label: 'Falhou', tone: 'failed' }
  }
  return { label: 'Aguardando', tone: 'idle' }
}
