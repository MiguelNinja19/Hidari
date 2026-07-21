import { createAsyncThunk } from '@reduxjs/toolkit'
import { queueApi } from '../../shared/api/tauri/queueApi'
import type { EnqueueJobInput } from '../../shared/types/contracts'

export const fetchJobs = createAsyncThunk(
  'queue/fetchJobs',
  async (_options?: { silent?: boolean }) => queueApi.listJobs(),
)

export const enqueueJob = createAsyncThunk('queue/enqueueJob', async (payload: EnqueueJobInput) =>
  queueApi.enqueueJob(payload),
)

export const cancelJob = createAsyncThunk('queue/cancelJob', async (id: string) => {
  await queueApi.cancelJob(id)
  return id
})

export const pauseJob = createAsyncThunk('queue/pauseJob', async (id: string) => {
  await queueApi.pauseJob(id)
  return id
})

export const resumeJob = createAsyncThunk('queue/resumeJob', async (id: string) => {
  await queueApi.resumeJob(id)
  return id
})

export const clearCompletedJobs = createAsyncThunk('queue/clearCompleted', async () => {
  return queueApi.clearCompletedJobs()
})
