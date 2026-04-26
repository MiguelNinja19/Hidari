export type AppPaths = {
  appDataDir: string
  appConfigDir: string
  appCacheDir: string
}

export type Source = {
  id: number
  name: string
  baseUrl: string
  status: 'active' | 'failed' | 'pending' | string
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
  name: string
  baseUrl: string
}

export type Game = {
  id: number
  title: string
  installPath: string
  isFavorite: boolean
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
  id: number
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
  destPath: string
  priority?: number
}

export type JobProgressEvent = {
  jobId: number
  progress: number
  status: string
  speedBytesPerSec: number
  etaSeconds: number
}

export type Collection = {
  id: number
  name: string
  gameCount: number
  createdAt: string
}
