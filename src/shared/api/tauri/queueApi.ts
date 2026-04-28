import { tauriClient } from './client'
import type { DownloadJob, EnqueueJobInput } from '../../types/contracts'

type LooseJob = Record<string, unknown>

const optFinite = (a: unknown, b?: unknown): number | undefined => {
  const v = a ?? b
  if (v == null) return undefined
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

const asNum = (a: unknown, b?: unknown, fallback = 0) => {
  const v = optFinite(a, b)
  return v ?? fallback
}

/** Normaliza resposta do sidecar (camelCase ou snake_case). */
export function normalizeDownloadJob(raw: LooseJob): DownloadJob {
  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    url: String(raw.url ?? ''),
    destPath: String(raw.destPath ?? raw.dest_path ?? ''),
    status: String(raw.status ?? 'pending'),
    priority: asNum(raw.priority),
    progress: asNum(raw.progress),
    bytesDownloaded: asNum(raw.bytesDownloaded, raw.bytes_downloaded),
    totalBytes: asNum(raw.totalBytes, raw.total_bytes),
    speedBps: optFinite(raw.speedBps, raw.speed_bps),
    etaSeconds: optFinite(raw.etaSeconds, raw.eta_seconds),
    seedEnabled:
      typeof raw.seedEnabled === 'boolean'
        ? raw.seedEnabled
        : typeof raw.seed_enabled === 'boolean'
          ? raw.seed_enabled
          : undefined,
    errorMsg:
      raw.errorMsg != null
        ? String(raw.errorMsg)
        : raw.error_msg != null
          ? String(raw.error_msg)
          : null,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? raw.createdAt ?? raw.created_at ?? ''),
  }
}

export const queueApi = {
  enqueueJob: async (payload: EnqueueJobInput) => {
    const raw = await tauriClient.invoke<LooseJob>('sidecar_enqueue_job', {
      payload,
    })
    return normalizeDownloadJob(raw ?? {})
  },
  listJobs: async () => {
    const rows = await tauriClient.invoke<unknown>('sidecar_list_jobs')
    if (!Array.isArray(rows)) return []
    return rows.map((row) => normalizeDownloadJob((row as LooseJob) ?? {}))
  },
  cancelJob: (id: string) => tauriClient.invoke<void>('sidecar_cancel_job', { id }),
  pauseJob: (id: string) => tauriClient.invoke<void>('sidecar_pause_job', { id }),
  resumeJob: (id: string) => tauriClient.invoke<void>('sidecar_resume_job', { id }),
  sidecarStatus: () => tauriClient.invoke<{ running: boolean; port?: number }>('sidecar_status'),
  launchJob: (id: string) => tauriClient.invoke<void>('sidecar_launch_job', { id }),
  openJobFolder: (id: string) => tauriClient.invoke<void>('sidecar_open_job_folder', { id }),
}
