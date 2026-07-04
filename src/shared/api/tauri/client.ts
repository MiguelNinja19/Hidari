import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { DownloadProgressEvent, ExtractStatusEvent, JobProgressEvent } from '../../types/contracts'

const isTauriRuntime = () =>
  typeof window !== 'undefined' &&
  typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
    'undefined'

const tauriUnavailableError = () =>
  new Error('Tauri indisponivel: execute com "npm run tauri:dev".')

const safeInvoke = async <T>(
  command: string,
  payload?: Record<string, unknown>,
): Promise<T> => {
  if (!isTauriRuntime()) {
    throw tauriUnavailableError()
  }
  return invoke<T>(command, payload)
}

const safeListen = async <T>(
  eventName: string,
  handler: (event: { payload: T }) => void,
): Promise<() => void> => {
  if (!isTauriRuntime()) {
    return () => {}
  }
  return listen<T>(eventName, handler)
}

export const tauriClient = {
  invoke: safeInvoke,
  listenDownloadProgress(
    handler: (event: DownloadProgressEvent) => void,
  ): Promise<() => void> {
    return safeListen<DownloadProgressEvent>('download://progress', (event) =>
      handler(event.payload),
    )
  },
  listenJobProgress(handler: (event: JobProgressEvent) => void): Promise<() => void> {
    return safeListen<JobProgressEvent>('queue://job-progress', (event) =>
      handler(event.payload),
    )
  },
  listenDeepLink(
    handler: (event: { url: string; gameId?: string; action?: string }) => void,
  ): Promise<() => void> {
    return safeListen<{ url: string; gameId?: string; action?: string }>(
      'app://deep-link',
      (event) => handler(event.payload),
    )
  },
  listenExtractStatus(
    handler: (event: ExtractStatusEvent) => void,
  ): Promise<() => void> {
    return safeListen<ExtractStatusEvent>('extract://status', (event) =>
      handler(event.payload),
    )
  },
}
