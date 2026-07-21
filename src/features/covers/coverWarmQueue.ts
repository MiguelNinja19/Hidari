import type { MutableRefObject, RefObject } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { GameCover } from '../../shared/types/contracts'
import { MAX_WARM_CONCURRENT, type WarmTask } from './coverTypes'

export type WarmQueueContext = {
  warmQueueRef: RefObject<WarmTask[]>
  warmInFlightRef: MutableRefObject<number>
  refresh: () => void
}

export function drainCoverWarmQueue(
  ctx: WarmQueueContext,
  onPatched?: (row: GameCover) => void,
) {
  while (ctx.warmInFlightRef.current < MAX_WARM_CONCURRENT && ctx.warmQueueRef.current.length > 0) {
    const task = ctx.warmQueueRef.current.shift()
    if (!task) break

    ctx.warmInFlightRef.current += 1
    void sourcesApi.saveGameCover(task.title, task.coverUrl).finally(() => {
      ctx.warmInFlightRef.current -= 1
      drainCoverWarmQueue(ctx, onPatched)
    })
  }
}
