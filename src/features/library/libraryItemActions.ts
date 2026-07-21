import { activeJobBlocksLibraryFolder } from '../../shared/utils/jobExtraction'
import type { DownloadJob, LibraryPathState } from '../../shared/types/contracts'
import type { LibraryEntry } from './types'
import { isJobFinished } from './libraryJobState'
import {
  getPathState,
  isPathStateResolved,
  itemHasGame,
  itemPathCtx,
  jobPathCtx,
  needsInstallItem,
} from './libraryPathState'

export const isPlayableLibraryItem = (
  item: LibraryEntry,
  jobs: DownloadJob[],
  states: Record<string, LibraryPathState>,
  defaultDownloadPath = '',
) => {
  if (!isPathStateResolved(item, states)) return false
  if (needsInstallItem(item, states)) return false
  if (getPathState(item.destPath, states, itemPathCtx(item))?.needsExtraction) return false
  if (!itemHasGame(item.destPath, states, itemPathCtx(item))) return false
  if (item.kind === 'job') return true
  return !jobs.some(
    (job) =>
      job.status !== 'extracted' &&
      job.status !== 'cancelled' &&
      !itemHasGame(job.destPath, states, jobPathCtx(job)) &&
      activeJobBlocksLibraryFolder(item.destPath, job.destPath, defaultDownloadPath),
  )
}

/** Só Instalar quando o inspect encontrou setup — nunca “acabou e !hasGame”. */
export const itemAwaitingInstall = (
  item: LibraryEntry,
  jobs: DownloadJob[],
  states: Record<string, LibraryPathState>,
  defaultDownloadPath = '',
) => {
  if (!isPathStateResolved(item, states)) return false
  if (isPlayableLibraryItem(item, jobs, states, defaultDownloadPath)) return false
  const state = getPathState(item.destPath, states, itemPathCtx(item))
  if (state?.needsExtraction) return false
  return state?.needsInstall === true
}

export const itemNeedsExtraction = (
  item: LibraryEntry,
  states: Record<string, LibraryPathState>,
) => {
  if (!isPathStateResolved(item, states)) return false
  if (itemHasGame(item.destPath, states, itemPathCtx(item))) return false
  return getPathState(item.destPath, states, itemPathCtx(item))?.needsExtraction === true
}

export const showPlayAction = isPlayableLibraryItem
export const showInstallAction = itemAwaitingInstall

export const showLocateInstallAction = (
  item: LibraryEntry,
  jobs: DownloadJob[],
  states: Record<string, LibraryPathState>,
  defaultDownloadPath = '',
) => {
  if (!isPathStateResolved(item, states)) return false
  if (isPlayableLibraryItem(item, jobs, states, defaultDownloadPath)) return false
  if (itemAwaitingInstall(item, jobs, states, defaultDownloadPath)) return false
  if (itemNeedsExtraction(item, states)) return false
  return !(item.kind === 'job' && item.job && !isJobFinished(item.job))
}

export const hasManualInstallRoot = (
  item: LibraryEntry,
  states: Record<string, LibraryPathState>,
) => Boolean(getPathState(item.destPath, states, itemPathCtx(item))?.customGameRoot?.trim())
