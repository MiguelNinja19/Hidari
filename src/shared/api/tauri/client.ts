import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { DownloadProgressEvent, JobProgressEvent } from '../../types/contracts'

export const tauriClient = {
  invoke,
  listenDownloadProgress(
    handler: (event: DownloadProgressEvent) => void,
  ): Promise<() => void> {
    return listen<DownloadProgressEvent>('download://progress', (event) =>
      handler(event.payload),
    )
  },
  listenJobProgress(handler: (event: JobProgressEvent) => void): Promise<() => void> {
    return listen<JobProgressEvent>('queue://job-progress', (event) =>
      handler(event.payload),
    )
  },
}
