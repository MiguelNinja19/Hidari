import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../hooks'
import { fetchJobs } from '../../features/queue/queueSlice'
import { selectHasActiveDownloads } from '../../features/queue/queueSelectors'
import type { NavTab } from '../../layout/types'
import { useQueuePolling } from './useQueuePolling'

type UseQueueSyncArgs = {
  activeTab: NavTab
  setDownloadsBooting?: (v: boolean) => void
  onJobsReconciled?: () => void
}

/** Sincroniza a fila sob demanda, em background com downloads ativos, e no foco. */
export function useQueueSync({
  activeTab,
  setDownloadsBooting,
  onJobsReconciled,
}: UseQueueSyncArgs) {
  const dispatch = useAppDispatch()
  const hasActiveDownloads = useAppSelector(selectHasActiveDownloads)
  const onJobsReconciledRef = useRef(onJobsReconciled)
  onJobsReconciledRef.current = onJobsReconciled
  const reconcileInFlightRef = useRef(false)

  useEffect(() => {
    if (activeTab !== 'library' && activeTab !== 'downloads') return

    let cancelled = false

    const loadQueue = async (attempt = 0) => {
      if (activeTab === 'downloads') setDownloadsBooting?.(true)
      // silent nos retries — evita toast "Falha na fila" a cada tentativa.
      const result = await dispatch(fetchJobs({ silent: attempt > 0 || activeTab !== 'downloads' }))
      if (cancelled) return

      const shouldRetry =
        fetchJobs.rejected.match(result) &&
        attempt < 8 &&
        (result.error.message?.includes('sidecar') ||
          result.error.message?.includes('download-engine') ||
          result.error.message?.includes('connection refused') ||
          result.error.message?.includes('10061'))

      if (shouldRetry) {
        await new Promise((resolve) => window.setTimeout(resolve, 400))
        return loadQueue(attempt + 1)
      }

      if (activeTab === 'downloads') setDownloadsBooting?.(false)
      onJobsReconciledRef.current?.()
    }

    void loadQueue()

    return () => {
      cancelled = true
      setDownloadsBooting?.(false)
    }
  }, [activeTab, dispatch, setDownloadsBooting])

  useQueuePolling(
    activeTab,
    hasActiveDownloads,
    dispatch,
    reconcileInFlightRef,
    onJobsReconciledRef,
  )
}
