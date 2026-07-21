import type { ActionReducerMapBuilder } from '@reduxjs/toolkit'
import {
  normalizeJob,
  shouldPreserveExtractionStatus,
  shouldPreserveProgress,
} from './queueJobNormalize'
import { fetchJobs } from './queueThunks'
import { isSidecarTransientError, type QueueState } from './queueTypes'

export function attachQueueFetchHandlers(builder: ActionReducerMapBuilder<QueueState>) {
  builder
    .addCase(fetchJobs.pending, (state) => {
      if (!state.initialized) state.loading = true
      state.error = null
    })
    .addCase(fetchJobs.fulfilled, (state, action) => {
      state.loading = false
      state.initialized = true
      const previousById = new Map(state.jobs.map((job) => [job.id, job]))
      const dismissed = new Set(state.dismissedJobIds)
      const incoming = action.payload
        .filter((raw) => !dismissed.has(raw.id))
        .map((raw) => {
          const previous = previousById.get(raw.id)
          const withExtraction = shouldPreserveExtractionStatus(raw, previous)
          const merged = shouldPreserveProgress(withExtraction, previous)
            ? { ...withExtraction, progress: previous?.progress ?? withExtraction.progress }
            : withExtraction
          return normalizeJob(merged)
        })
      const incomingIds = new Set(incoming.map((job) => job.id))
      // Keep any local job the sidecar omitted (cancelled/completed races, brief kick gaps)
      // until the user clears them via "Limpar downloads".
      const localOnly = state.jobs.filter(
        (job) => !incomingIds.has(job.id) && !dismissed.has(job.id),
      )
      state.jobs = [...incoming, ...localOnly.map((job) => normalizeJob(job))]
    })
    .addCase(fetchJobs.rejected, (state, action) => {
      state.loading = false
      state.initialized = true
      if (action.meta.arg?.silent) return
      const message = action.error.message ?? 'Erro ao carregar fila.'
      if (isSidecarTransientError(message)) return
      state.error = message
    })
}
