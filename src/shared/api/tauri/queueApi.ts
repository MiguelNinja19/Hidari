import { tauriClient } from './client'
import type { EnqueueJobInput } from '../../types/contracts'
import {
  normalizeDownloadJob,
  parseJobsPayload,
  type LooseJob,
} from './queueJobPayload'

export { normalizeDownloadJob, parseJobsPayload } from './queueJobPayload'

export const queueApi = {
  enqueueJob: async (payload: EnqueueJobInput) => {
    const raw = await tauriClient.invoke<LooseJob>('sidecar_enqueue_job', {
      payload: {
        title: payload.title,
        url: payload.url,
        destPath: payload.destPath,
        priority: payload.priority,
        coverUrl: payload.coverUrl ?? null,
        sourceName: payload.sourceName ?? null,
      },
    })
    return normalizeDownloadJob(raw ?? {})
  },
  listJobs: async () => {
    const rows = await tauriClient.invoke<unknown>('sidecar_list_jobs')
    return parseJobsPayload(rows).map((row) => normalizeDownloadJob(row ?? {}))
  },
  cancelJob: (id: string) => tauriClient.invoke<void>('sidecar_cancel_job', { id }),
  pauseJob: (id: string) => tauriClient.invoke<void>('sidecar_pause_job', { id }),
  resumeJob: (id: string) => tauriClient.invoke<void>('sidecar_resume_job', { id }),
  sidecarStatus: () => tauriClient.invoke<{ running: boolean; port?: number }>('sidecar_status'),
  launchJob: (id: string) => tauriClient.invoke<string>('sidecar_launch_job', { id }),
  openJobFolder: (id: string) => tauriClient.invoke<void>('sidecar_open_job_folder', { id }),
  extractJob: (id: string) => tauriClient.invoke<void>('extract_job_archive', { id }),
  clearCompletedJobs: () => tauriClient.invoke<string[]>('clear_completed_jobs'),
  removeJobFromLibrary: (id: string) =>
    tauriClient.invoke<void>('remove_job_from_library', { id }),
}
