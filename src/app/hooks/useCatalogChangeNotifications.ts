import { useEffect, useRef } from 'react'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { CATALOG_CHANGES_POLL_MS } from '../../shared/config/polling'

async function ensureNotificationPermission(): Promise<boolean> {
  try {
    let granted = await isPermissionGranted()
    if (!granted) {
      const permission = await requestPermission()
      granted = permission === 'granted'
    }
    return granted
  } catch {
    return false
  }
}

/** Notifica quando fontes de catálogo têm novos jogos após sync. */
export function useCatalogChangeNotifications(enabled: boolean) {
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const poll = async () => {
      try {
        const changes = await sourcesApi.checkCatalogChanges()
        if (cancelled || changes.length === 0) return
        const canNotify = await ensureNotificationPermission()
        if (!canNotify) return
        for (const change of changes) {
          const key = `${change.sourceId}:${change.newCount}`
          if (seenRef.current.has(key)) continue
          seenRef.current.add(key)
          void sendNotification({
            title: 'Novos repacks no catálogo',
            body: `${change.sourceName}: +${change.newCount} entradas`,
          })
        }
      } catch {
        // ignore polling errors
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), CATALOG_CHANGES_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [enabled])
}
