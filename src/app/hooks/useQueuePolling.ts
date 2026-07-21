import { useEffect, type MutableRefObject } from 'react'
import type { AppDispatch } from '../store'
import { fetchJobs } from '../../features/queue/queueSlice'
import {
  POLL_ACTIVE_JOBS_BACKGROUND_MS,
  POLL_ACTIVE_JOBS_MS,
} from '../../shared/config/polling'
import type { NavTab } from '../../layout/types'

export function useQueuePolling(
  activeTab: NavTab,
  hasActiveDownloads: boolean,
  dispatch: AppDispatch,
  inFlightRef: MutableRefObject<boolean>,
  reconciledRef: MutableRefObject<(() => void) | undefined>,
) {
  useEffect(() => {
    if (!hasActiveDownloads) return
    const intervalMs =
      activeTab === 'downloads' ? POLL_ACTIVE_JOBS_MS : POLL_ACTIVE_JOBS_BACKGROUND_MS
    const reconcile = () => {
      if (inFlightRef.current) return
      inFlightRef.current = true
      void dispatch(fetchJobs({ silent: true }))
        .then(() => reconciledRef.current?.())
        .finally(() => {
          inFlightRef.current = false
        })
    }
    reconcile()
    const id = window.setInterval(reconcile, intervalMs)
    return () => window.clearInterval(id)
  }, [hasActiveDownloads, dispatch, activeTab, inFlightRef, reconciledRef])

  useEffect(() => {
    const onFocus = () => {
      if (inFlightRef.current) return
      inFlightRef.current = true
      void dispatch(fetchJobs({ silent: true }))
        .then(() => reconciledRef.current?.())
        .finally(() => {
          inFlightRef.current = false
        })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [dispatch, inFlightRef, reconciledRef])
}
