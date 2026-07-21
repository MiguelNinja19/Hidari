import { useCallback, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { GameCover } from '../../shared/types/contracts'
import { coverTitleKey } from '../../shared/utils/normalizeTitleKey'
import { indexSavedCoverRows } from './coverIndexing'
import { patchBatchCoverRows } from './coverBatchPatch'
import {
  clearCoverLookupPending,
  isCoverLookupPending,
  markCoverLookupPending,
} from './coverLookup'
import { collectCoverKeysFromTitles, notifyCoverKeys } from './coverSubscriptions'
import { BATCH_DEBOUNCE_MS, BATCH_LOOKUP_RETRY_MS, type ResolvedCover } from './coverTypes'

export function useCoverBatchFlush(
  commitSavedCovers: (
    updater: (prev: Record<string, GameCover>) => Record<string, GameCover>,
    notifyTitles?: string[],
  ) => void,
  resolveCoverRef: MutableRefObject<
    (title: string, catalogCoverUrl?: string | null, catalogLocalPath?: string | null) => ResolvedCover
  >,
  loadingKeysRef: MutableRefObject<Set<string>>,
  enqueueWarm: (title: string, coverUrl: string) => void,
) {
  const batchLookupAttemptAtRef = useRef(new Map<string, number>())
  const batchInFlightRef = useRef(false)
  const batchTimerRef = useRef<number | null>(null)
  const pendingBatchTitlesRef = useRef<string[]>([])

  const flushResolveCoversBatch = useCallback(
    (titles: string[]) => {
      const missing = titles.filter((title) => {
        if (isCoverLookupPending(title, loadingKeysRef.current)) return false
        const resolved = resolveCoverRef.current(title)
        if (resolved.coverUrl || resolved.localPath) return false
        const key = coverTitleKey(title)
        const lastBatchAttempt = batchLookupAttemptAtRef.current.get(key) ?? 0
        return !(lastBatchAttempt > 0 && Date.now() - lastBatchAttempt < BATCH_LOOKUP_RETRY_MS)
      })
      if (missing.length === 0) return
      if (batchTimerRef.current != null) window.clearTimeout(batchTimerRef.current)

      batchTimerRef.current = window.setTimeout(() => {
        batchTimerRef.current = null
        const pending = missing.filter((title) => !isCoverLookupPending(title, loadingKeysRef.current))
        if (pending.length === 0) return
        if (batchInFlightRef.current) {
          pendingBatchTitlesRef.current.push(...pending)
          return
        }
        for (const title of pending) {
          markCoverLookupPending(title, loadingKeysRef.current)
          batchLookupAttemptAtRef.current.set(coverTitleKey(title), Date.now())
        }
        notifyCoverKeys(collectCoverKeysFromTitles(pending))
        batchInFlightRef.current = true
        void sourcesApi
          .resolveCoversForTitles(pending)
          .then((rows) => {
            for (const row of rows) {
              const url = row.coverUrl?.trim()
              if (url && !row.localCoverPath?.trim()) enqueueWarm(row.title, url)
            }
            commitSavedCovers(
              (prev) => indexSavedCoverRows({ ...prev }, patchBatchCoverRows(rows, loadingKeysRef)),
              pending,
            )
          })
          .catch(() => {
            for (const title of pending) clearCoverLookupPending(title, loadingKeysRef.current)
            notifyCoverKeys(collectCoverKeysFromTitles(pending))
          })
          .finally(() => {
            batchInFlightRef.current = false
            const queued = pendingBatchTitlesRef.current
            pendingBatchTitlesRef.current = []
            if (queued.length > 0) flushResolveCoversBatch(queued)
          })
      }, BATCH_DEBOUNCE_MS)
    },
    [commitSavedCovers, enqueueWarm, loadingKeysRef, resolveCoverRef],
  )

  return useCallback((titles: string[]) => flushResolveCoversBatch(titles), [flushResolveCoversBatch])
}
