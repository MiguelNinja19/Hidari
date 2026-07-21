import { useCallback, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { DownloadJob, GameCover } from '../../shared/types/contracts'
import { coverTitleKey } from '../../shared/utils/normalizeTitleKey'
import { coverPreferenceRank, findSavedCover } from './coverIndexing'
import { findCatalogCover } from './coverLookup'
import { drainCoverWarmQueue } from './coverWarmQueue'
import { WARM_RETRY_MS, type WarmTask } from './coverTypes'

export function useCoverWarmActions(
  savedCoversRef: MutableRefObject<Record<string, GameCover>>,
  coverByTitleKey: Map<string, { coverUrl: string; localPath?: string | null }>,
  refreshCoversRef: MutableRefObject<() => void>,
  patchSavedCoverRef: MutableRefObject<(row: GameCover) => void>,
) {
  const warmQueueRef = useRef<WarmTask[]>([])
  const warmInFlightRef = useRef(0)
  const warmAttemptAtRef = useRef(new Map<string, number>())

  const enqueueWarm = useCallback(
    (title: string, coverUrl: string) => {
      const trimmed = coverUrl.trim()
      if (!trimmed) return

      const key = coverTitleKey(title)
      const saved = findSavedCover(title, savedCoversRef.current)
      if (saved) {
        const sameUrl = saved.coverUrl.trim() === trimmed
        if (sameUrl && saved.localPath) return
        if (coverPreferenceRank(trimmed) > coverPreferenceRank(saved.coverUrl)) return
        if (
          sameUrl === false &&
          saved.localPath &&
          coverPreferenceRank(trimmed) === coverPreferenceRank(saved.coverUrl) &&
          coverPreferenceRank(trimmed) > 0
        ) {
          return
        }
      }

      const lastAttempt = warmAttemptAtRef.current.get(key) ?? 0
      if (Date.now() - lastAttempt < WARM_RETRY_MS && lastAttempt > 0) {
        const canUpgrade =
          saved != null &&
          coverPreferenceRank(trimmed) < coverPreferenceRank(saved.coverUrl)
        if (!canUpgrade) return
      }

      if (warmQueueRef.current.some((task) => task.key === key)) return

      warmAttemptAtRef.current.set(key, Date.now())
      warmQueueRef.current.push({ title, coverUrl: trimmed, key })
      drainCoverWarmQueue(
        { warmQueueRef, warmInFlightRef, refresh: () => refreshCoversRef.current() },
        (row) => patchSavedCoverRef.current(row),
      )
    },
    [patchSavedCoverRef, refreshCoversRef, savedCoversRef],
  )

  const warmCover = useCallback(
    (title: string, coverUrl: string) => {
      enqueueWarm(title, coverUrl)
    },
    [enqueueWarm],
  )

  const warmCovers = useCallback(
    (items: Array<{ title: string; coverUrl: string }>) => {
      for (const item of items) {
        enqueueWarm(item.title, item.coverUrl)
      }
    },
    [enqueueWarm],
  )

  const syncJobCovers = useCallback(
    (jobs: DownloadJob[]) => {
      const pending = jobs
        .map((job) => {
          if (findSavedCover(job.title, savedCoversRef.current)) return null
          const coverUrl = findCatalogCover(job.title, coverByTitleKey)?.coverUrl
          if (!coverUrl) return null
          return { title: job.title, coverUrl }
        })
        .filter((item): item is { title: string; coverUrl: string } => item != null)

      if (pending.length === 0) return
      warmCovers(pending)
    },
    [coverByTitleKey, savedCoversRef, warmCovers],
  )

  return { enqueueWarm, warmCover, warmCovers, syncJobCovers }
}
