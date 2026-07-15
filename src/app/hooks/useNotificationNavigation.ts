import { useEffect } from 'react'
import { onAction } from '@tauri-apps/plugin-notification'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { NavTab } from '../../layout/types'

type UseNotificationNavigationOptions = {
  onNavigate: (tab: NavTab) => void
}

function navFromExtra(extra: Record<string, unknown> | undefined): NavTab | null {
  const raw = extra?.hidariNav
  if (raw === 'library' || raw === 'downloads' || raw === 'discover' || raw === 'favorites' || raw === 'settings') {
    return raw
  }
  return null
}

/** Foca a janela e navega quando o utilizador clica numa notificação OS (quando o plugin suporta). */
export function useNotificationNavigation({ onNavigate }: UseNotificationNavigationOptions) {
  useEffect(() => {
    let cancelled = false
    let unregister: (() => void) | undefined

    void (async () => {
      try {
        const listener = await onAction(async (notification) => {
          try {
            await getCurrentWindow().setFocus()
          } catch {
            // ignore
          }
          const tab = navFromExtra(notification.extra)
          if (tab) onNavigate(tab)
        })
        if (cancelled) {
          void listener.unregister()
          return
        }
        unregister = () => {
          void listener.unregister()
        }
      } catch {
        // Desktop pode não expor onAction — toasts in-app já cobrem o feedback.
      }
    })()

    return () => {
      cancelled = true
      unregister?.()
    }
  }, [onNavigate])
}
