import { tauriClient } from './client'
import type { DownloadJob, EnqueueJobInput } from '../../types/contracts'

export const queueApi = {
  enqueueJob: (payload: EnqueueJobInput) =>
    tauriClient.invoke<DownloadJob>('sidecar_enqueue_job', {
      payload,
    }),
  listJobs: () => tauriClient.invoke<DownloadJob[]>('sidecar_list_jobs'),
  cancelJob: (id: string) => tauriClient.invoke<void>('sidecar_cancel_job', { id }),
  pauseJob: (id: string) => tauriClient.invoke<void>('sidecar_pause_job', { id }),
  resumeJob: (id: string) => tauriClient.invoke<void>('sidecar_resume_job', { id }),
  sidecarStatus: () => tauriClient.invoke<{ running: boolean; port?: number }>('sidecar_status'),
  launchJob: (id: string) => tauriClient.invoke<void>('sidecar_launch_job', { id }),
  openJobFolder: (id: string) => tauriClient.invoke<void>('sidecar_open_job_folder', { id }),
}
