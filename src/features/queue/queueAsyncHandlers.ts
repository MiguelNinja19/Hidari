import type { ActionReducerMapBuilder } from '@reduxjs/toolkit'
import { normalizeJob } from './queueJobNormalize'
import {
  cancelJob,
  clearCompletedJobs,
  enqueueJob,
  pauseJob,
  resumeJob,
} from './queueThunks'
import { attachQueueFetchHandlers } from './queueFetchHandlers'
import {
  isSidecarConnectionError,
  isSidecarRequestError,
  type QueueState,
} from './queueTypes'

export function attachQueueMutationHandlers(builder: ActionReducerMapBuilder<QueueState>) {
  builder
    .addCase(enqueueJob.fulfilled, (state, action) => {
      state.jobs.push(normalizeJob(action.payload))
      state.error = null
    })
    .addCase(enqueueJob.rejected, (state, action) => {
      const message = action.error.message ?? 'Erro ao enfileirar download.'
      if (isSidecarConnectionError(message)) return
      state.error = message
    })
    .addCase(cancelJob.fulfilled, (state, action) => {
      const id = String(action.payload)
      const job = state.jobs.find((j) => String(j.id) === id)
      if (job) {
        job.status = 'cancelled'
        job.errorMsg = null
      }
      state.error = null
    })
    .addCase(cancelJob.rejected, (state, action) => {
      const message = action.error.message ?? 'Erro ao cancelar download.'
      if (isSidecarRequestError(message)) return
      state.error = message
    })
    .addCase(pauseJob.fulfilled, (state, action) => {
      const job = state.jobs.find((j) => j.id === action.payload)
      if (job) job.status = 'paused'
      state.error = null
    })
    .addCase(pauseJob.rejected, (state, action) => {
      const message = action.error.message ?? 'Erro ao pausar download.'
      if (isSidecarRequestError(message)) return
      state.error = message
    })
    .addCase(resumeJob.fulfilled, (state, action) => {
      const job = state.jobs.find((j) => j.id === action.payload)
      if (job) job.status = 'pending'
      state.error = null
    })
    .addCase(resumeJob.rejected, (state, action) => {
      const message = action.error.message ?? 'Erro ao retomar download.'
      if (isSidecarRequestError(message)) return
      state.error = message
    })
    .addCase(clearCompletedJobs.fulfilled, (state, action) => {
      const removed = new Set(action.payload)
      state.jobs = state.jobs.filter((j) => !removed.has(j.id))
      for (const id of removed) {
        if (!state.dismissedJobIds.includes(id)) state.dismissedJobIds.push(id)
      }
      state.error = null
    })
    .addCase(clearCompletedJobs.rejected, (state, action) => {
      const message = action.error.message ?? 'Erro ao limpar concluídos.'
      if (isSidecarRequestError(message)) return
      state.error = message
    })
}

export function attachQueueAsyncHandlers(builder: ActionReducerMapBuilder<QueueState>) {
  attachQueueFetchHandlers(builder)
  attachQueueMutationHandlers(builder)
}
