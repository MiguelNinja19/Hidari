import type { DownloadJob } from '../../shared/types/contracts'
import { cleanTitleForDisplay } from '../../shared/utils/normalizeTitleKey'
import {
  resolveDownloadNotifyKind,
  type DownloadNotifySnapshot,
} from './downloadNotifyKind'

export type PendingDownloadNotification = {
  kind: 'install' | 'play'
  gameTitle: string
}

function snapshotOf(job: DownloadJob): DownloadNotifySnapshot {
  return {
    status: job.status,
    extractionStatus: job.extractionStatus ?? null,
    progress: job.progress,
    bytesDownloaded: job.bytesDownloaded,
    totalBytes: job.totalBytes,
  }
}

export function collectDownloadNotifications(
  jobs: DownloadJob[],
  previous: Map<string, DownloadNotifySnapshot>,
  notified: Set<string>,
  notifyInstall: boolean,
  notifyPlay: boolean,
): PendingDownloadNotification[] {
  const pending: PendingDownloadNotification[] = []
  for (const job of jobs) {
    const next = snapshotOf(job)
    const prev = previous.get(job.id) ?? null
    previous.set(job.id, next)
    const kind = resolveDownloadNotifyKind(prev, next)
    if (!kind || (kind === 'install' && !notifyInstall) || (kind === 'play' && !notifyPlay)) {
      continue
    }
    const dedupeKey = `${job.id}:${kind}`
    if (notified.has(dedupeKey)) continue
    notified.add(dedupeKey)
    pending.push({ kind, gameTitle: cleanTitleForDisplay(job.title) })
  }
  return pending
}
