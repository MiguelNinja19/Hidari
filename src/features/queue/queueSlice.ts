import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { queueApi } from '../../shared/api/tauri/queueApi'
import type { DownloadJob, EnqueueJobInput, JobProgressEvent } from '../../shared/types/contracts'

type QueueState = {
  jobs: DownloadJob[]
  loading: boolean
  error: string | null
}

const initialState: QueueState = {
  jobs: [],
  loading: false,
  error: null,
}

export const fetchJobs = createAsyncThunk('queue/fetchJobs', async () => queueApi.listJobs())

export const enqueueJob = createAsyncThunk('queue/enqueueJob', async (payload: EnqueueJobInput) =>
  queueApi.enqueueJob(payload),
)

export const cancelJob = createAsyncThunk('queue/cancelJob', async (id: number) => {
  await queueApi.cancelJob(id)
  return id
})

export const pauseJob = createAsyncThunk('queue/pauseJob', async (id: number) => {
  await queueApi.pauseJob(id)
  return id
})

export const resumeJob = createAsyncThunk('queue/resumeJob', async (id: number) => {
  await queueApi.resumeJob(id)
  return id
})

export const clearCompletedJobs = createAsyncThunk('queue/clearCompleted', async () => {
  await queueApi.clearCompletedJobs()
})

const queueSlice = createSlice({
  name: 'queue',
  initialState,
  reducers: {
    jobProgressReceived: (state, action: { payload: JobProgressEvent }) => {
      const { jobId, progress, status } = action.payload
      const job = state.jobs.find((j) => j.id === jobId)
      if (job) {
        job.progress = progress
        job.status = status
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchJobs.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchJobs.fulfilled, (state, action) => {
        state.loading = false
        state.jobs = action.payload
      })
      .addCase(fetchJobs.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message ?? 'Erro ao carregar fila.'
      })
      .addCase(enqueueJob.fulfilled, (state, action) => {
        state.jobs.push(action.payload)
      })
      .addCase(enqueueJob.rejected, (state, action) => {
        state.error = action.error.message ?? 'Erro ao enfileirar download.'
      })
      .addCase(cancelJob.fulfilled, (state, action) => {
        const job = state.jobs.find((j) => j.id === action.payload)
        if (job) job.status = 'cancelled'
      })
      .addCase(pauseJob.fulfilled, (state, action) => {
        const job = state.jobs.find((j) => j.id === action.payload)
        if (job) job.status = 'paused'
      })
      .addCase(resumeJob.fulfilled, (state, action) => {
        const job = state.jobs.find((j) => j.id === action.payload)
        if (job) job.status = 'pending'
      })
      .addCase(clearCompletedJobs.fulfilled, (state) => {
        state.jobs = state.jobs.filter(
          (j) => j.status !== 'completed' && j.status !== 'cancelled',
        )
      })
  },
})

export const { jobProgressReceived } = queueSlice.actions
export const queueReducer = queueSlice.reducer
