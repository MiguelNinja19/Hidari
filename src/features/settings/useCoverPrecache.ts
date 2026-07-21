import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listen } from '@tauri-apps/api/event'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { useToast } from '../../shared/components/ToastProvider'
import type { CoverPrecacheStatus } from '../../shared/types/contracts'
import { formatUserError } from '../../shared/utils/formatUserError'

export function useCoverPrecache() {
  const { t } = useTranslation()
  const { showError } = useToast()
  const [coverPrecacheStatus, setCoverPrecacheStatus] =
    useState<CoverPrecacheStatus | null>(null)
  const [coverPrecacheBusy, setCoverPrecacheBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void sourcesApi.getCoverPrecacheStatus().then((status) => {
      if (!cancelled) setCoverPrecacheStatus(status)
    }).catch(() => undefined)
    void listen<CoverPrecacheStatus>('cover-precache-progress', (event) => {
      if (!cancelled) setCoverPrecacheStatus(event.payload)
    }).then((stop) => {
      if (cancelled) stop()
      else unlisten = stop
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  const run = async (
    action: () => Promise<CoverPrecacheStatus>,
  ) => {
    setCoverPrecacheBusy(true)
    try {
      setCoverPrecacheStatus(await action())
    } catch (error) {
      showError(formatUserError(error, t('settings.toastCoversError')))
    } finally {
      setCoverPrecacheBusy(false)
    }
  }

  return {
    coverPrecacheStatus,
    coverPrecacheBusy,
    onStartCoverPrecache: () => run(() => sourcesApi.startCoverPrecache()),
    onStopCoverPrecache: () => run(() => sourcesApi.stopCoverPrecache()),
    onRetryUnresolvedCovers: () => run(() => sourcesApi.retryUnresolvedCovers()),
  }
}
