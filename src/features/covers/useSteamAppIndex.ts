import { useCallback, useEffect, useState } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { SteamAppIndexStatus } from '../../shared/types/contracts'

export function useSteamAppIndex() {
  const [status, setStatus] = useState<SteamAppIndexStatus | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const refreshStatus = useCallback(async () => {
    try {
      const next = await sourcesApi.getSteamAppIndexStatus()
      setStatus(next)
    } catch {
      /* offline / dev web */
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (!status?.refreshing) return
    const timer = window.setInterval(() => {
      void refreshStatus()
    }, 4000)
    return () => window.clearInterval(timer)
  }, [status?.refreshing, refreshStatus])

  const refreshIndex = useCallback(async () => {
    setRefreshing(true)
    try {
      const next = await sourcesApi.refreshSteamAppIndex()
      setStatus(next)
    } finally {
      setRefreshing(false)
    }
  }, [])

  return { status, refreshing, refreshIndex }
}
