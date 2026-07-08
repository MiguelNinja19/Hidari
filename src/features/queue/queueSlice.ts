import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { queueApi } from '../../shared/api/tauri/queueApi'
import type {
  DownloadJob,
  EnqueueJobInput,
  ExtractStatusEvent,
  JobProgressEvent,
} from '../../shared/types/contracts'
import { resolveJobProgressPercentFromFields } from '../../shared/utils/jobProgress'

type QueueState = {
  jobs: DownloadJob[]
  dismissedJobIds: string[]
  loading: boolean
  error: string | null
  initialized: boolean
}

const normalizeJobProgress = (job: DownloadJob) =>
  resolveJobProgressPercentFromFields({
    progress: job.progress,
    bytesDownloaded: Number.isFinite(job.bytesDownloaded) ? Math.max(0, job.bytesDownloaded) : 0,
    totalBytes: Number.isFinite(job.totalBytes) ? job.totalBytes : 0,
    status: job.status,
    url: job.url,
    speedBps: job.speedBps,
  })

const normalizeJob = (job: DownloadJob): DownloadJob => ({
  ...job,
  updatedAt: job.updatedAt ?? job.createdAt,
})

const jobProgressSignal = (job: DownloadJob) =>
  normalizeJobProgress(job) > 0 ||
  job.bytesDownloaded > 0 ||
  job.totalBytes > 0 ||
  (job.speedBps ?? 0) > 0

const shouldPreserveProgress = (incoming: DownloadJob, previous?: DownloadJob) => {
  if (!previous) return false
  if (!jobProgressSignal(previous)) return false
  if (jobProgressSignal(incoming)) return false
  return (
    incoming.status === 'paused' ||
    incoming.status === 'downloading' ||
    incoming.status === 'pending' ||
    incoming.status === 'retrying' ||
    incoming.status === 'seeding'
  )
}

const shouldPreserveExtractionStatus = (incoming: DownloadJob, previous?: DownloadJob) => {
  const localStatuses = ['extracting', 'extracted', 'failed', 'skipped'] as const
  if (localStatuses.includes(incoming.status as (typeof localStatuses)[number])) {
    return {
      ...incoming,
      progress:
        incoming.status === 'extracted' || incoming.status === 'skipped' ? 100 : incoming.progress,
    }
  }
  if (!previous) return incoming
  if (
    localStatuses.includes(previous.status as (typeof localStatuses)[number]) &&
    incoming.status === 'completed'
  ) {
    return {
      ...incoming,
      status: previous.status === 'skipped' ? 'completed' : previous.status,
      progress:
        previous.status === 'extracted' || previous.status === 'skipped' ? 100 : incoming.progress,
      errorMsg: previous.errorMsg ?? incoming.errorMsg,
    }
  }
  return incoming
}

const initialState: QueueState = {
  jobs: [],
  dismissedJobIds: [],
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
  return queueApi.clearCompletedJobs()
})

const queueSlice = createSlice({
  name: 'queue',
  initialState,
  reducers: {
    jobProgressReceived: (state, action: { payload: JobProgressEvent }) => {
      const {
        jobId: rawJobId,
        progress,
        status,
        speedBytesPerSec,
        etaSeconds,
        bytesDownloaded,
        totalBytes,
      } = action.payload
      const jobId = String(rawJobId)
      if (state.dismissedJobIds.includes(jobId)) return
      const job = state.jobs.find((j) => String(j.id) === jobId)
      if (!job) return
      const merged: DownloadJob = {
        ...job,
        status,
        progress,
        speedBps: speedBytesPerSec,
        etaSeconds,
        bytesDownloaded: bytesDownloaded ?? job.bytesDownloaded,
        totalBytes: totalBytes ?? job.totalBytes,
      }
      job.status = merged.status
      job.speedBps = merged.speedBps
      job.etaSeconds = merged.etaSeconds
      job.bytesDownloaded = merged.bytesDownloaded
      job.totalBytes = merged.totalBytes
      job.progress = progress
    },
    extractStatusReceived: (state, action: { payload: ExtractStatusEvent }) => {
      const { jobId: rawJobId, status, message } = action.payload
      const jobId = String(rawJobId)
      const job = state.jobs.find((j) => String(j.id) === jobId)
      if (!job) return
      if (status === 'verified' || status === 'verify_failed') {
        job.extractionStatus = status
        if (status === 'verify_failed') {
          job.status = status
          if (message) job.errorMsg = message
        }
        return
      }
      if (status === 'skipped') {
        job.status = 'completed'
        job.progress = 100
        return
      }
      job.status = status
      job.extractionStatus = status
      if (status === 'extracted') job.progress = 100
      if (status === 'failed' && message) job.errorMsg = message
    },
    removeJobLocally: (state, action: { payload: string }) => {
      const id = action.payload
      state.jobs = state.jobs.filter((job) => job.id !== id)
      if (!state.dismissedJobIds.includes(id)) {
        state.dismissedJobIds.push(id)
      }
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
        const dismissed = new Set(state.dismissedJobIds)
        const incoming = action.payload
          .filter((raw) => !dismissed.has(raw.id))
          .map((raw) => {
            const previous = previousById.get(raw.id)
            const withExtraction = shouldPreserveExtractionStatus(raw, previous)
            const merged = shouldPreserveProgress(withExtraction, previous)
              ? {
                  ...withExtraction,
                  progress: previous?.progress ?? withExtraction.progress,
                }
              : withExtraction
            return normalizeJob(merged)
          })
        const incomingIds = new Set(incoming.map((job) => job.id))
        const localOnly = state.jobs.filter(
          (job) =>
            !incomingIds.has(job.id) &&
            !dismissed.has(job.id) &&
            ['extracting', 'extracted', 'failed'].includes(job.status),
        )
        state.jobs = [...incoming, ...localOnly.map((job) => normalizeJob(job))]
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
        const id = String(action.payload)
        state.jobs = state.jobs.filter((j) => String(j.id) !== id)
        if (!state.dismissedJobIds.includes(id)) {
          state.dismissedJobIds.push(id)
        }
        state.error = null
      })
      .addCase(cancelJob.rejected, (state, action) => {
        state.error = action.error.message ?? 'Erro ao cancelar download.'
      })
      .addCase(pauseJob.fulfilled, (state, action) => {
        const job = state.jobs.find((j) => j.id === action.payload)
        if (job) job.status = 'paused'
      })
      .addCase(resumeJob.fulfilled, (state, action) => {
        const job = state.jobs.find((j) => j.id === action.payload)
        if (job) job.status = 'pending'
      })
      .addCase(clearCompletedJobs.fulfilled, (state, action) => {
        const removed = new Set(action.payload)
        state.jobs = state.jobs.filter((j) => !removed.has(j.id))
        for (const id of removed) {
          if (!state.dismissedJobIds.includes(id)) {
            state.dismissedJobIds.push(id)
          }
        }
      })
  },
})

export const { jobProgressReceived, extractStatusReceived, removeJobLocally, clearHistoryLocally } =
  queueSlice.actions
export const queueReducer = queueSlice.reducer
