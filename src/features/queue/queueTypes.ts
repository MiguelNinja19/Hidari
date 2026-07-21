import type { DownloadJob } from '../../shared/types/contracts'

export type QueueState = {
  jobs: DownloadJob[]
  dismissedJobIds: string[]
  loading: boolean
  error: string | null
  initialized: boolean
}

export const initialQueueState: QueueState = {
  jobs: [],
  dismissedJobIds: [],
  loading: false,
  error: null,
  initialized: false,
}

export function isSidecarTransientError(message: string): boolean {
  return /sidecar_not_running|sidecar_request_failed|sidecar_parse_failed|download-engine|connection refused|os error 10061|timed out/i.test(
    message,
  )
}

export function isSidecarConnectionError(message: string): boolean {
  return /sidecar_not_running|sidecar_request_failed|connection refused|os error 10061/i.test(
    message,
  )
}

export function isSidecarRequestError(message: string): boolean {
  return /sidecar_not_running|sidecar_request_failed|connection refused/i.test(message)
}
