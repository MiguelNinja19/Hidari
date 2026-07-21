import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { listen } from '@tauri-apps/api/event'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { CoverPrecacheStatus, GameCover } from '../../shared/types/contracts'
import { scheduleDeferred } from '../../shared/utils/scheduleDeferred'
import { indexSavedCoverRows } from './coverIndexing'
import { collectCoverKeysFromTitles, notifyCoverKeys } from './coverSubscriptions'

export function useCoverSavedSync(options?: { eager?: boolean }) {
  const [savedCovers, setSavedCovers] = useState<Record<string, GameCover>>({})
  const savedCoversRef = useRef(savedCovers)
  const refreshTimerRef = useRef<number | null>(null)
  const [, startCoverTransition] = useTransition()

  useEffect(() => {
    savedCoversRef.current = savedCovers
  }, [savedCovers])

  const commitSavedCovers = useCallback(
    (updater: (prev: Record<string, GameCover>) => Record<string, GameCover>, notifyTitles?: string[]) => {
      const next = updater(savedCoversRef.current)
      savedCoversRef.current = next
      startCoverTransition(() => {
        setSavedCovers(next)
      })
      if (notifyTitles && notifyTitles.length > 0) {
        notifyCoverKeys(collectCoverKeysFromTitles(notifyTitles))
      } else {
        notifyCoverKeys(Object.keys(next))
      }
    },
    [startCoverTransition],
  )

  const refreshCovers = useCallback(() => {
    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current)
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null
      void sourcesApi.listGameCovers().then((rows) => {
        commitSavedCovers(
          (prev) => indexSavedCoverRows({ ...prev }, rows),
          rows.map((row) => row.titleKey),
        )
      })
    }, 350)
  }, [commitSavedCovers])

  const refreshCoversRef = useRef(refreshCovers)
  useEffect(() => {
    refreshCoversRef.current = refreshCovers
  }, [refreshCovers])

  useEffect(() => {
    const loadSavedCovers = () => {
      void sourcesApi.listGameCovers().then((rows) => {
        commitSavedCovers(
          (prev) => indexSavedCoverRows({ ...prev }, rows),
          rows.map((row) => row.titleKey),
        )
      })
    }

    if (options?.eager) {
      loadSavedCovers()
      return
    }

    const cancel = scheduleDeferred(loadSavedCovers, 0)
    return cancel
  }, [options?.eager, commitSavedCovers])

  useEffect(() => {
    let cancelled = false
    void listen<CoverPrecacheStatus>('cover-precache-progress', (event) => {
      if (cancelled || event.payload.running) return
      refreshCoversRef.current()
    }).then((unlisten) => () => {
      cancelled = true
      void unlisten()
    })
    return () => {
      cancelled = true
    }
  }, [])

  const patchSavedCover = useCallback(
    (row: GameCover) => {
      commitSavedCovers((prev) => indexSavedCoverRows({ ...prev }, [row]), [row.titleKey])
    },
    [commitSavedCovers],
  )

  return { savedCoversRef, commitSavedCovers, refreshCovers, refreshCoversRef, patchSavedCover }
}
