export type CoverStatus = 'idle' | 'loading' | 'cached' | 'error'

export type ResolvedCover = {
  coverUrl: string | null
  localPath: string | null
  status: CoverStatus
}

export const WARM_RETRY_MS = 30 * 60 * 1000
export const BATCH_LOOKUP_RETRY_MS = 15 * 60 * 1000
export const BATCH_DEBOUNCE_MS = 80
export const MAX_WARM_CONCURRENT = 2
export const INVALIDATE_COOLDOWN_MS = 10 * 60 * 1000

export type WarmTask = { title: string; coverUrl: string; key: string }
