import type { DownloadJob } from '../../shared/types/contracts'

export const baseQueueJob: DownloadJob = {
  id: 'job-1',
  title: 'Test Game',
  url: 'magnet:?xt=',
  destPath: 'D:\\Games',
  status: 'completed',
  priority: 0,
  progress: 100,
  bytesDownloaded: 1000,
  totalBytes: 1000,
  errorMsg: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

export const baseQueueState = {
  dismissedJobIds: [] as string[],
  loading: false,
  error: null,
  initialized: true,
}
