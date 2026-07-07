import { useEffect, useState } from 'react'
import { queueApi } from '../../shared/api/tauri/queueApi'

const POLL_MS = 15_000

/** Verifica periodicamente se o sidecar de downloads está a responder. */
export function useSidecarStatus(active: boolean) {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    if (!active) return

    let cancelled = false

    const check = async () => {
      try {
        const status = await queueApi.sidecarStatus()
        if (!cancelled) setOnline(Boolean(status.running))
      } catch {
        if (!cancelled) setOnline(false)
      }
    }

    void check()
    const timer = window.setInterval(() => void check(), POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [active])

  return online
}
