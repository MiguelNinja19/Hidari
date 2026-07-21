import { useEffect } from 'react'
import { useAppDispatch } from '../hooks'
import { fetchSources } from '../../features/sources/sourcesSlice'
import { fetchJobs } from '../../features/queue/queueSlice'
import { STARTUP_JOBS_DEFER_MS } from '../../shared/config/polling'
import { scheduleDeferred } from '../../shared/utils/scheduleDeferred'
import type { BootstrapSettings } from './bootstrapSettings'
import { useBootstrapQueueEvents } from './useBootstrapQueueEvents'
import { useBootstrapSettings } from './useBootstrapSettings'

/** Carrega fontes, settings e listeners Tauri no arranque. */
export function useAppBootstrap(settings: BootstrapSettings) {
  const dispatch = useAppDispatch()
  useBootstrapSettings(settings)
  useBootstrapQueueEvents(dispatch)

  useEffect(() => {
    void dispatch(fetchSources())
    const cancelJobsDefer = scheduleDeferred(() => {
      void dispatch(fetchJobs())
    }, STARTUP_JOBS_DEFER_MS)

    return () => {
      cancelJobsDefer()
    }
  }, [dispatch])
}
