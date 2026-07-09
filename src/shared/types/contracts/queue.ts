export type DownloadJob = {
  id: string
  title: string
  url: string
  destPath: string
  status:
    | 'pending'
    | 'downloading'
    | 'seeding'
    | 'retrying'
    | 'paused'
    | 'completed'
    | 'extracting'
    | 'extracted'
    | 'failed'
    | 'cancelled'
    | string
  priority: number
  progress: number
  bytesDownloaded: number
  totalBytes: number
  speedBps?: number
  etaSeconds?: number
  seedEnabled?: boolean
  errorMsg: string | null
  extractionStatus?: string | null
  createdAt: string
  updatedAt: string
}

export type EnqueueJobInput = {
  title: string
  url: string
  destPath?: string
  priority?: number
  coverUrl?: string | null
}

export type JobProgressEvent = {
  jobId: string
  progress: number
  status: string
  speedBytesPerSec: number
  etaSeconds: number
  bytesDownloaded?: number
  totalBytes?: number
  errorMsg?: string | null
}

export type ExtractStatusEvent = {
  jobId: string
  status:
    | 'extracting'
    | 'extracted'
    | 'failed'
    | 'skipped'
    | 'verified'
    | 'verify_failed'
    | string
  message?: string | null
}

export type DownloadOption = {
  sourceId: string
  sourceName: string
  title: string
  downloadType: 'http' | 'torrent' | string
  url: string
  quality: string
  coverUrl?: string | null
}
