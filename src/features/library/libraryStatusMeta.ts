import type { DownloadJob, LibraryPathState } from '../../shared/types/contracts'
import { isTorrentMetadataPhase, resolveJobProgressPercent } from '../../shared/utils/jobProgress'
import { isJobFinished } from './libraryJobState'
import {
  isPlayableLibraryItem,
  itemAwaitingInstall,
  itemNeedsExtraction,
} from './libraryItemActions'
import { getPathState, itemPathCtx } from './libraryPathState'
import type { LibraryEntry } from './types'

export type LibraryStatusMeta = { tone: string; labelKey: string; pct?: number }

const fallbackJob = (item: LibraryEntry): DownloadJob =>
  item.job ?? {
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

export function libraryStatusMeta(
  item: LibraryEntry,
  jobs: DownloadJob[],
  states: Record<string, LibraryPathState>,
  ctx?: { installing?: boolean; defaultDownloadPath?: string },
): LibraryStatusMeta {
  const defaultDownloadPath = ctx?.defaultDownloadPath ?? ''
  const state = getPathState(item.destPath, states, itemPathCtx(item))
  if (ctx?.installing) return { labelKey: 'library.status.installing', tone: 'installing' }
  if (state === undefined) {
    if (item.kind === 'folder' || (item.kind === 'job' && item.job && isJobFinished(item.job))) {
      return { labelKey: 'library.status.verifying', tone: 'verifying' }
    }
  }
  if (itemNeedsExtraction(item, states)) {
    return { labelKey: 'library.status.preparing', tone: 'verifying' }
  }
  if (itemAwaitingInstall(item, jobs, states, defaultDownloadPath)) {
    return { labelKey: 'library.status.install', tone: 'waiting' }
  }
  if (isPlayableLibraryItem(item, jobs, states, defaultDownloadPath)) {
    return { labelKey: 'library.status.play', tone: 'ready' }
  }
  if (item.kind === 'folder') return { labelKey: 'library.status.inLibrary', tone: 'idle' }
  if (['downloading', 'pending', 'retrying'].includes(item.status)) {
    const job = fallbackJob(item)
    if (isTorrentMetadataPhase(job)) {
      return { labelKey: 'library.status.connectingPeers', tone: 'downloading' }
    }
    const pct = resolveJobProgressPercent(job)
    if (pct > 0) {
      return {
        labelKey: 'library.status.downloadingPct',
        tone: 'downloading',
        pct: Math.min(100, pct),
      }
    }
    return { labelKey: 'library.status.downloading', tone: 'downloading' }
  }
  if (item.status === 'paused') return { labelKey: 'library.status.paused', tone: 'paused' }
  if (item.status === 'failed') return { labelKey: 'library.status.failed', tone: 'failed' }
  if (item.status === 'seeding') return { labelKey: 'library.status.play', tone: 'ready' }
  return { labelKey: 'library.status.waiting', tone: 'idle' }
}
