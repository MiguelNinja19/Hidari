import { resolveDeletePath } from '../../shared/utils/archive'
import type { DownloadJob, LibraryPathState } from '../../shared/types/contracts'
import type { LibraryEntry } from './types'

export const pathStateKey = (
  path: string,
  ctx?: { jobId?: string; title?: string },
) => {
  if (ctx?.jobId) return `job:${ctx.jobId}`
  const base = resolveDeletePath(path).toLowerCase()
  return ctx?.title ? `${base}::${ctx.title.trim().toLowerCase()}` : base
}

export const getPathState = (
  path: string,
  pathStateByKey: Record<string, LibraryPathState>,
  ctx?: { jobId?: string; title?: string },
) => pathStateByKey[pathStateKey(path, ctx)]

export const jobPathCtx = (job: DownloadJob) => ({ jobId: job.id, title: job.title })
export const itemPathCtx = (item: LibraryEntry) => ({
  jobId: item.kind === 'job' ? item.id : undefined,
  title: item.title,
})

export const isPathStateResolved = (
  item: LibraryEntry,
  states: Record<string, LibraryPathState>,
) => getPathState(item.destPath, states, itemPathCtx(item)) !== undefined

export const itemHasGame = (
  path: string,
  states: Record<string, LibraryPathState>,
  ctx?: { jobId?: string; title?: string },
) => {
  const state = getPathState(path, states, ctx)
  return state?.hasGame === true || state?.playable === true
}

export const needsInstallItem = (
  item: LibraryEntry,
  states: Record<string, LibraryPathState>,
) => getPathState(item.destPath, states, itemPathCtx(item))?.needsInstall === true
