import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { useAppSettings } from '../context/AppSettingsContext'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'

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

/** Notifica novidades no catálogo ao focar a janela (sem polling). */
export function useCatalogChangeNotifications(enabled: boolean) {
  const { t } = useTranslation()
  const { notifyCatalogChanges, notifySound } = useAppSettings()
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!enabled || !notifyCatalogChanges) return
    let cancelled = false

    const check = async () => {
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
            title: t('downloads.notifyCatalogTitle'),
            body: t('downloads.notifyCatalogBody', {
              name: change.sourceName,
              count: change.newCount,
            }),
            extra: { hidariNav: 'discover' },
            ...(notifySound ? {} : { silent: true }),
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
      cancelled = true
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, notifyCatalogChanges, notifySound, t])
}
