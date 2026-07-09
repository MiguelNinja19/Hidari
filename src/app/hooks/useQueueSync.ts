import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../hooks'
import { fetchJobs } from '../../features/queue/queueSlice'
import { selectHasActiveDownloads } from '../../features/queue/queueSelectors'
import { POLL_ACTIVE_JOBS_MS } from '../../shared/config/polling'
import type { NavTab } from '../../layout/types'

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

  useEffect(() => {
    if (activeTab !== 'library' && activeTab !== 'downloads') return

    let cancelled = false

    const loadQueue = async (attempt = 0) => {
      if (activeTab === 'downloads') setDownloadsBooting?.(true)
      const result = await dispatch(fetchJobs())
      if (cancelled) return

      const shouldRetry =
        activeTab === 'downloads' &&
        fetchJobs.rejected.match(result) &&
        attempt < 8 &&
        (result.error.message?.includes('sidecar') ||
          result.error.message?.includes('download-engine'))

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

  useEffect(() => {
    if (!hasActiveDownloads) return

    const reconcile = () => {
      void dispatch(fetchJobs({ silent: true })).then(() => {
        onJobsReconciledRef.current?.()
      })
    }

    reconcile()
    const id = window.setInterval(reconcile, POLL_ACTIVE_JOBS_MS)
    return () => window.clearInterval(id)
  }, [hasActiveDownloads, dispatch])

  useEffect(() => {
    const onFocus = () => {
      void dispatch(fetchJobs({ silent: true })).then(() => {
        onJobsReconciledRef.current?.()
      })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [dispatch])
}
