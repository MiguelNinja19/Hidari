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

/** Extrai array de jobs da resposta do sidecar (array ou `{ jobs: [] }`). */
export function parseJobsPayload(payload: unknown): LooseJob[] {
  if (Array.isArray(payload)) {
    return payload as LooseJob[]
  }
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    const nested = obj.jobs ?? obj.data ?? obj.items
    if (Array.isArray(nested)) {
      return nested as LooseJob[]
    }
  }
  return []
}

/** Normaliza resposta do sidecar (camelCase ou snake_case). */
export function normalizeDownloadJob(raw: LooseJob): DownloadJob {
  const bytesDownloaded = asNum(
    raw.bytesDownloaded,
    raw.bytes_downloaded ?? raw.downloadedBytes ?? raw.downloaded,
  )
  const totalBytes = asNum(raw.totalBytes, raw.total_bytes ?? raw.totalSize ?? raw.size)
  const progress = asNum(
    raw.progress,
    raw.progressPercent ?? raw.percent ?? raw.percentage ?? raw.completion,
  )

  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    url: String(raw.url ?? ''),
    destPath: String(raw.destPath ?? raw.dest_path ?? ''),
    status: String(raw.status ?? 'pending'),
    priority: asNum(raw.priority),
    progress,
    bytesDownloaded,
    totalBytes,
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
      payload: {
        title: payload.title,
        url: payload.url,
        destPath: payload.destPath,
        priority: payload.priority,
        coverUrl: payload.coverUrl ?? null,
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
