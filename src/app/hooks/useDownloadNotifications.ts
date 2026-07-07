import { useEffect, useRef } from 'react'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { cleanTitleForDisplay } from '../../shared/utils/normalizeTitleKey'
import type { DownloadJob } from '../../shared/types/contracts'

const NOTIFY_STATUSES = new Set(['completed', 'extracted'])

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

/** Notifica quando um download conclui ou fica pronto para jogar. */
export function useDownloadNotifications(jobs: DownloadJob[]) {
  const prevStatusRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const canNotify = await ensureNotificationPermission()
      if (!canNotify || cancelled) return

      for (const job of jobs) {
        const prev = prevStatusRef.current.get(job.id)
        if (prev === job.status) continue
        prevStatusRef.current.set(job.id, job.status)

        if (!prev || !NOTIFY_STATUSES.has(job.status)) continue

        const title =
          job.status === 'extracted'
            ? 'Pronto para jogar'
            : 'Download concluído'
        const body = cleanTitleForDisplay(job.title)

        try {
          await sendNotification({ title, body })
        } catch {
          // ignorar falha de notificação
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [jobs])
}
