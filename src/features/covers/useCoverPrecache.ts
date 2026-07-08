import { useCallback, useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { CoverPrecacheStatus } from '../../shared/types/contracts'

const EMPTY_STATUS: CoverPrecacheStatus = {
  running: false,
  total: 0,
  processed: 0,
  cached: 0,
  downloaded: 0,
  unresolved: 0,
  failed: 0,
}

type UseCoverPrecacheOptions = {
  onProgress?: () => void
}

export function useCoverPrecache({ onProgress }: UseCoverPrecacheOptions = {}) {
  const [status, setStatus] = useState<CoverPrecacheStatus>(EMPTY_STATUS)
  const [stats, setStats] = useState<CoverPrecacheStatus>(EMPTY_STATUS)

  const refreshStats = useCallback(async () => {
    try {
      const next = await sourcesApi.getCoverCacheStats()
      setStats(next)
    } catch {
      /* offline / dev web */
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const next = await sourcesApi.getCoverPrecacheStatus()
      setStatus(next)
      if (!next.running) {
        await refreshStats()
      }
    } catch {
      /* offline / dev web */
    }
  }, [refreshStats])

  useEffect(() => {
    void refreshStats()
    void refreshStatus()
  }, [refreshStats, refreshStatus])

  useEffect(() => {
    let cancelled = false
    void listen<CoverPrecacheStatus>('cover-precache-progress', (event) => {
      if (cancelled) return
      setStatus(event.payload)
      if (!event.payload.running) {
        onProgress?.()
        void refreshStats()
      }
    }).then((unlisten) => () => {
      cancelled = true
      void unlisten()
    })
    return () => {
      cancelled = true
    }
  }, [onProgress, refreshStats])

  const startPrecache = useCallback(async () => {
    const next = await sourcesApi.startCoverPrecache()
    setStatus(next)
    return next
  }, [])

  const stopPrecache = useCallback(async () => {
    const next = await sourcesApi.stopCoverPrecache()
    setStatus(next)
    return next
  }, [])

  const retryUnresolved = useCallback(async () => {
    const next = await sourcesApi.retryUnresolvedCovers()
    setStatus(next)
    await refreshStats()
    return next
  }, [refreshStats])

  const cachedTotal = stats.cached
  const catalogTotal = stats.total
  const unresolvedTotal = stats.unresolved
  const progressPct =
    status.running && status.total > 0
      ? Math.min(100, Math.round((status.processed / status.total) * 100))
      : catalogTotal > 0
        ? Math.min(100, Math.round((cachedTotal / catalogTotal) * 100))
        : 0

  return {
    status,
    stats,
    cachedTotal,
    catalogTotal,
    unresolvedTotal,
    progressPct,
    startPrecache,
    stopPrecache,
    retryUnresolved,
    refreshStats,
  }
}
