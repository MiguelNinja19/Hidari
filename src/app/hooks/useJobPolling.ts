import { useEffect } from 'react'
import { useAppDispatch } from '../hooks'
import { fetchJobs } from '../../features/queue/queueSlice'
import {
  POLL_ACTIVE_JOBS_MS,
  POLL_DOWNLOADS_MS,
  POLL_LIBRARY_IDLE_MS,
  POLL_RECONCILE_MS,
} from '../../shared/config/polling'
import type { DownloadJob } from '../../shared/types/contracts'
import type { NavTab } from '../../layout/types'

type UseJobPollingArgs = {
  activeTab: NavTab
  jobs: DownloadJob[]
  refreshLibraryScan?: (options?: { background?: boolean }) => void
  setDownloadsBooting?: (v: boolean) => void
}

/** Intervalos de refresh da fila conforme tab e estado dos jobs. */
export function useJobPolling({
  activeTab,
  jobs,
  refreshLibraryScan,
  setDownloadsBooting,
}: UseJobPollingArgs) {
  const dispatch = useAppDispatch()

  const needsFastJobPolling = jobs.some(
    (job) =>
      job.status === 'downloading' ||
      job.status === 'pending' ||
      job.status === 'retrying',
  )

  useEffect(() => {
    if (activeTab === 'discover' && !needsFastJobPolling) return
    if (activeTab !== 'downloads' && activeTab !== 'library' && !needsFastJobPolling) return

    const intervalMs = needsFastJobPolling
      ? POLL_ACTIVE_JOBS_MS
      : activeTab === 'downloads'
        ? POLL_DOWNLOADS_MS
        : activeTab === 'library'
          ? POLL_LIBRARY_IDLE_MS
          : POLL_RECONCILE_MS
    const polling = window.setInterval(() => {
      void dispatch(fetchJobs())
    }, intervalMs)
    return () => window.clearInterval(polling)
  }, [dispatch, activeTab, needsFastJobPolling])

  useEffect(() => {
    if (activeTab !== 'library' || !refreshLibraryScan) return
    const timer = window.setInterval(() => {
      refreshLibraryScan({ background: true })
    }, POLL_LIBRARY_IDLE_MS)
    return () => window.clearInterval(timer)
  }, [activeTab, refreshLibraryScan])

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
      if (activeTab === 'library') refreshLibraryScan?.({ background: true })
    }

    void loadQueue()

    return () => {
      cancelled = true
      setDownloadsBooting?.(false)
    }
  }, [activeTab, dispatch, refreshLibraryScan, setDownloadsBooting])
}
