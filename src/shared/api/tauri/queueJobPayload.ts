import type { DownloadJob } from '../../types/contracts'

export type LooseJob = Record<string, unknown>

const optFinite = (a: unknown, b?: unknown): number | undefined => {
  const value = a ?? b
  if (value == null) return undefined
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

const asNum = (a: unknown, b?: unknown, fallback = 0) =>
  optFinite(a, b) ?? fallback

export function parseJobsPayload(payload: unknown): LooseJob[] {
  if (Array.isArray(payload)) return payload as LooseJob[]
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    const nested = obj.jobs ?? obj.data ?? obj.items
    if (Array.isArray(nested)) return nested as LooseJob[]
  }
  return []
}

export function normalizeDownloadJob(raw: LooseJob): DownloadJob {
  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    url: String(raw.url ?? ''),
    destPath: String(raw.destPath ?? raw.dest_path ?? ''),
    status: String(raw.status ?? 'pending'),
    priority: asNum(raw.priority),
    progress: asNum(
      raw.progress,
      raw.progressPercent ?? raw.percent ?? raw.percentage ?? raw.completion,
    ),
    bytesDownloaded: asNum(
      raw.bytesDownloaded,
      raw.bytes_downloaded ?? raw.downloadedBytes ?? raw.downloaded,
    ),
    totalBytes: asNum(raw.totalBytes, raw.total_bytes ?? raw.totalSize ?? raw.size),
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
    extractionStatus:
      raw.extractionStatus != null
        ? String(raw.extractionStatus)
        : raw.extraction_status != null
          ? String(raw.extraction_status)
          : null,
    sourceName:
      raw.sourceName != null
        ? String(raw.sourceName)
        : raw.source_name != null
          ? String(raw.source_name)
          : null,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? raw.createdAt ?? raw.created_at ?? ''),
  }
}
