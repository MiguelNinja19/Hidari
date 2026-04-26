import { tauriClient } from './client'
import type { DownloadJob, EnqueueJobInput } from '../../types/contracts'

export const queueApi = {
  enqueueJob: (payload: EnqueueJobInput) =>
    tauriClient.invoke<DownloadJob>('enqueue_job', { payload }),
  listJobs: () => tauriClient.invoke<DownloadJob[]>('list_jobs'),
  cancelJob: (id: number) => tauriClient.invoke<void>('cancel_job', { payload: { id } }),
  pauseJob: (id: number) => tauriClient.invoke<void>('pause_job', { payload: { id } }),
  resumeJob: (id: number) => tauriClient.invoke<void>('resume_job', { payload: { id } }),
  clearCompletedJobs: () => tauriClient.invoke<void>('clear_completed_jobs'),
}
