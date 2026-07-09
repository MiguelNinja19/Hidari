import { useEffect, useState } from 'react'
import { queueApi } from '../../shared/api/tauri/queueApi'

/** Verifica o sidecar uma vez quando a tab Downloads fica activa. */
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
    return () => {
      cancelled = true
    }
  }, [active])

  return online
}
