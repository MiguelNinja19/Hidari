import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { queueApi } from '../../shared/api/tauri/queueApi'
import type { DownloadJob, EnqueueJobInput, JobProgressEvent } from '../../shared/types/contracts'

type QueueState = {
  jobs: DownloadJob[]
  loading: boolean
  error: string | null
  initialized: boolean
}

const clampProgress = (value: number) => {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

/** Alguns motores enviam fração 0–1 em vez de percentagem 0–100. */
const coerceProgressToPercent = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) return 0
  if (value > 0 && value <= 1) return value * 100
  return value
}

const normalizeJobProgress = (job: DownloadJob) => {
  const totalBytes = Number.isFinite(job.totalBytes) ? job.totalBytes : 0
  const bytesDownloaded = Number.isFinite(job.bytesDownloaded) ? Math.max(0, job.bytesDownloaded) : 0
  const hasKnownTotal = totalBytes > 0

  const fromBytes = hasKnownTotal ? clampProgress((bytesDownloaded / totalBytes) * 100) : null
  const server = clampProgress(coerceProgressToPercent(job.progress))

  let blended = fromBytes != null ? fromBytes : server

  if (hasKnownTotal && fromBytes != null) {
    blended = fromBytes
  }

  const hasTransferSignal =
    (Number.isFinite(job.speedBps) && (job.speedBps ?? 0) > 0) ||
    (Number.isFinite(job.etaSeconds) && (job.etaSeconds ?? 0) > 0)

  if (job.status === 'completed') return 100

  if (job.status === 'seeding') {
    if (hasKnownTotal && bytesDownloaded >= totalBytes) return 100
    if (hasKnownTotal && bytesDownloaded < totalBytes) {
      return clampProgress((bytesDownloaded / totalBytes) * 100)
    }
    return Math.min(99, blended >= 100 ? 99 : blended)
  }

  if (job.status === 'cancelled' || job.status === 'failed') return blended

  if (hasKnownTotal && bytesDownloaded >= totalBytes) return 100

  if (blended >= 100) return 99

  if (blended > 0) return blended

  if (
    hasTransferSignal &&
    (job.status === 'downloading' || job.status === 'retrying' || job.status === 'pending')
  ) {
    return Math.max(blended, 1)
  }

  return blended
}

const normalizeJob = (job: DownloadJob): DownloadJob => ({
  ...job,
  progress: normalizeJobProgress(job),
  updatedAt: job.updatedAt ?? job.createdAt,
})

const shouldPreserveProgress = (incoming: DownloadJob, previous?: DownloadJob) => {
  if (!previous) return false
  if (previous.progress <= 0) return false
  if (incoming.progress > 0) return false
  return (
    incoming.status === 'paused' ||
    incoming.status === 'downloading' ||
    incoming.status === 'pending' ||
    incoming.status === 'retrying' ||
    incoming.status === 'seeding'
  )
}

const initialState: QueueState = {
  jobs: [],
  loading: false,
  error: null,
  initialized: false,
}

export const fetchJobs = createAsyncThunk('queue/fetchJobs', async () => queueApi.listJobs())

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
  return true
})

const queueSlice = createSlice({
  name: 'queue',
  initialState,
  reducers: {
    jobProgressReceived: (state, action: { payload: JobProgressEvent }) => {
      const { jobId, progress, status } = action.payload
      const job = state.jobs.find((j) => j.id === jobId)
      if (job) {
        job.progress = normalizeJobProgress({ ...job, progress, status })
        job.status = status
      }
    },
    removeJobLocally: (state, action: { payload: string }) => {
      state.jobs = state.jobs.filter((job) => job.id !== action.payload)
    },
    clearHistoryLocally: (state) => {
      state.jobs = state.jobs.filter(
        (job) =>
          job.status !== 'completed' &&
          job.status !== 'cancelled' &&
          job.status !== 'failed',
      )
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchJobs.pending, (state) => {
        if (!state.initialized) {
          state.loading = true
        }
        state.error = null
      })
      .addCase(fetchJobs.fulfilled, (state, action) => {
        state.loading = false
        state.initialized = true
        const previousById = new Map(state.jobs.map((job) => [job.id, job]))
        state.jobs = action.payload.map((incoming) => {
          const previous = previousById.get(incoming.id)
          const merged = shouldPreserveProgress(incoming, previous)
            ? {
                ...incoming,
                progress: previous?.progress ?? incoming.progress,
              }
            : incoming
          return normalizeJob(merged)
        })
      })
      .addCase(fetchJobs.rejected, (state, action) => {
        state.loading = false
        state.initialized = true
        state.error = action.error.message ?? 'Erro ao carregar fila.'
      })
      .addCase(enqueueJob.fulfilled, (state, action) => {
        state.jobs.push(normalizeJob(action.payload))
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

export const { jobProgressReceived, removeJobLocally, clearHistoryLocally } = queueSlice.actions
export const queueReducer = queueSlice.reducer
