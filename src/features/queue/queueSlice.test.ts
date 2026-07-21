import { describe, expect, it } from 'vitest'
import {
  extractStatusReceived,
  fetchJobs,
  queueReducer,
} from './queueSlice'
import type { DownloadJob } from '../../shared/types/contracts'

const baseJob: DownloadJob = {
  id: 'job-1',
  title: 'Test Game',
  url: 'magnet:?xt=',
  destPath: 'D:\\Games',
  status: 'completed',
  priority: 0,
  progress: 100,
  bytesDownloaded: 1000,
  totalBytes: 1000,
  errorMsg: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

const baseState = {
  dismissedJobIds: [] as string[],
  loading: false,
  error: null,
  initialized: true,
}

describe('queueSlice', () => {
  it('updates job status on extract event', () => {
    const state = queueReducer(
      { jobs: [baseJob], ...baseState },
      extractStatusReceived({
        jobId: 'job-1',
        status: 'extracting',
      }),
    )

    expect(state.jobs[0]?.status).toBe('extracting')
  })

  it('sets progress to 100 when extracted', () => {
    const state = queueReducer(
      {
        jobs: [{ ...baseJob, status: 'extracting', progress: 95 }],
        ...baseState,
      },
      extractStatusReceived({
        jobId: 'job-1',
        status: 'extracted',
      }),
    )

    expect(state.jobs[0]?.status).toBe('extracted')
    expect(state.jobs[0]?.progress).toBe(100)
  })

  it('verify_failed não remove job completed da biblioteca', () => {
    const state = queueReducer(
      { jobs: [baseJob], ...baseState },
      extractStatusReceived({
        jobId: 'job-1',
        status: 'verify_failed',
        message: 'verify_no_file',
      }),
    )

    expect(state.jobs[0]?.status).toBe('completed')
    expect(state.jobs[0]?.extractionStatus).toBe('verify_failed')
    expect(state.jobs[0]?.errorMsg).toBe('verify_no_file')
  })

  it('preserva completed local quando sidecar não devolve o job', () => {
    const state = queueReducer(
      { jobs: [baseJob], ...baseState },
      {
        type: fetchJobs.fulfilled.type,
        payload: [],
        meta: { arg: { silent: true } },
      },
    )

    expect(state.jobs).toHaveLength(1)
    expect(state.jobs[0]?.status).toBe('completed')
  })

})
