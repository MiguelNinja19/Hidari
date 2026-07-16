import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppSettings } from '../context/AppSettingsContext'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import {
  sendHidariNotification,
  warmNotificationPermission,
} from '../../shared/utils/osNotification'

/** Notifica novidades no catálogo ao focar a janela (sem polling). */
export function useCatalogChangeNotifications(enabled: boolean) {
  const { t } = useTranslation()
  const { notifyCatalogChanges } = useAppSettings()
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!enabled || !notifyCatalogChanges) return
    warmNotificationPermission()
  }, [enabled, notifyCatalogChanges])

  useEffect(() => {
    if (!enabled || !notifyCatalogChanges) return
    let disposed = false

    const check = async () => {
      try {
        const changes = await sourcesApi.checkCatalogChanges()
        if (disposed || changes.length === 0) return

        const toSend: Array<{ key: string; sourceName: string; newCount: number }> = []
        for (const change of changes) {
          const key = `${change.sourceId}:${change.newCount}`
          if (seenRef.current.has(key)) continue
          seenRef.current.add(key)
          toSend.push({
            key,
            sourceName: change.sourceName,
            newCount: change.newCount,
          })
        }
        if (toSend.length === 0) return

        for (const change of toSend) {
          await sendHidariNotification({
            title: t('downloads.notifyCatalogTitle'),
            body: t('downloads.notifyCatalogBody', {
              name: change.sourceName,
              count: change.newCount,
            }),
            extra: { hidariNav: 'discover' },
          })
        }
      } catch {
        // ignore
      }
    }

    const onFocus = () => {
      void check()
    }

    void check()
    window.addEventListener('focus', onFocus)
    return () => {
      disposed = true
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, notifyCatalogChanges, t])
}
