export type AppPaths = {
  appDataDir: string
  appConfigDir: string
  appCacheDir: string
}

export type Source = {
  id: string
  name: string
  url: string
  status: 'pendingMatching' | 'matching' | 'matched' | 'failed' | string
  downloadCount: number
  fingerprint?: string
  createdAt: string
}

export type DownloadProgressEvent = {
  downloadId: string
  progress: number
  speedBytesPerSec: number
  etaSeconds: number
  status: 'downloading' | 'completed' | string
}

export type AddSourceInput = {
  url: string
}

export type SourceTestResult = {
  sourceId: string
  ok: boolean
  statusCode?: number
  latencyMs: number
  message: string
}

export type Game = {
  id: number
  title: string
  installPath: string
  isFavorite: boolean
  newDownloadOptionsCount: number
  createdAt: string
}

export type AddGameInput = {
  title: string
  installPath: string
}

export type UpdateGameInput = {
  id: number
  title: string
  installPath: string
}

export type DownloadJob = {
  id: string
  title: string
  url: string
  destPath: string
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled' | string
  priority: number
  progress: number
  bytesDownloaded: number
  totalBytes: number
  errorMsg: string | null
  createdAt: string
  updatedAt: string
}

export type EnqueueJobInput = {
  title: string
  url: string
  destPath?: string
  priority?: number
}

export type JobProgressEvent = {
  jobId: string
  progress: number
  status: string
  speedBytesPerSec: number
  etaSeconds: number
}

export type GameSourceChange = {
  gameId: number
  newDownloadOptionsCount: number
}

export type DownloadOption = {
  sourceId: string
  sourceName: string
  title: string
  downloadType: 'http' | 'torrent' | string
  url: string
  quality: string
}

export type SearchDownloadOptionsInput = {
  query: string
}

export type Collection = {
  id: number
  name: string
  gameCount: number
  createdAt: string
}
