import { createSlice } from '@reduxjs/toolkit'
import { attachQueueAsyncHandlers } from './queueAsyncHandlers'
import { applyExtractStatusEvent } from './queueExtractStatusHandler'
import { applyJobProgressEvent } from './queueJobProgressHandler'
import { initialQueueState } from './queueTypes'

export {
  cancelJob,
  clearCompletedJobs,
  enqueueJob,
  fetchJobs,
  pauseJob,
  resumeJob,
} from './queueThunks'

const queueSlice = createSlice({
  name: 'queue',
  initialState: initialQueueState,
  reducers: {
    jobProgressReceived: (state, action) => {
      const jobId = String(action.payload.jobId)
      if (state.dismissedJobIds.includes(jobId)) return
      const job = state.jobs.find((j) => String(j.id) === jobId)
      if (!job || job.status === 'cancelled') return
      applyJobProgressEvent(job, action.payload)
    },
    extractStatusReceived: (state, action) => {
      const jobId = String(action.payload.jobId)
      const job = state.jobs.find((j) => String(j.id) === jobId)
      if (!job) return
      applyExtractStatusEvent(job, action.payload)
    },
    removeJobLocally: (state, action: { payload: string }) => {
      const id = action.payload
      state.jobs = state.jobs.filter((job) => job.id !== id)
      if (!state.dismissedJobIds.includes(id)) {
        state.dismissedJobIds.push(id)
      }
    },
  },
  extraReducers: (builder) => {
    attachQueueAsyncHandlers(builder)
  },
})

export const { jobProgressReceived, extractStatusReceived, removeJobLocally } = queueSlice.actions
export const queueReducer = queueSlice.reducer
