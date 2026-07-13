import { describe, expect, it } from 'vitest'
import {
  extractStatusReceived,
  cancelJob,
  fetchJobs,
  jobProgressReceived,
  queueReducer,
  removeJobLocally,
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

  it('guarda bytes e progresso bruto do sidecar', () => {
    const state = queueReducer(
      {
        jobs: [{ ...baseJob, status: 'downloading', progress: 0, bytesDownloaded: 0, totalBytes: 0 }],
        ...baseState,
      },
      jobProgressReceived({
        jobId: 'job-1',
        progress: 0,
        status: 'downloading',
        speedBytesPerSec: 1024,
        etaSeconds: 120,
        bytesDownloaded: 250,
        totalBytes: 1000,
      }),
    )

    expect(state.jobs[0]?.bytesDownloaded).toBe(250)
    expect(state.jobs[0]?.totalBytes).toBe(1000)
    expect(state.jobs[0]?.progress).toBe(0)
  })

  it('propaga errorMsg do evento de progresso', () => {
    const state = queueReducer(
      {
        jobs: [{ ...baseJob, status: 'downloading', errorMsg: null }],
        ...baseState,
      },
      jobProgressReceived({
        jobId: 'job-1',
        progress: 0,
        status: 'failed',
        speedBytesPerSec: 0,
        etaSeconds: 0,
        errorMsg: 'torrent_client_exit_code: exit code: 13',
      }),
    )

    expect(state.jobs[0]?.status).toBe('failed')
    expect(state.jobs[0]?.errorMsg).toContain('exit code: 13')
  })

  it('ignora progress inflado sem bytes no magnet', () => {
    const state = queueReducer(
      {
        jobs: [
          {
            ...baseJob,
            status: 'downloading',
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: 0,
            url: 'magnet:?xt=urn:btih:abc',
          },
        ],
        ...baseState,
      },
      jobProgressReceived({
        jobId: 'job-1',
        progress: 100,
        status: 'downloading',
        speedBytesPerSec: 0,
        etaSeconds: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
      }),
    )

    expect(state.jobs[0]?.progress).toBe(100)
  })

  it('uses sidecar progress percent when bytes are not yet available', () => {
    const state = queueReducer(
      {
        jobs: [
          {
            ...baseJob,
            status: 'downloading',
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: 0,
            url: 'magnet:?xt=urn:btih:abc',
          },
        ],
        ...baseState,
      },
      jobProgressReceived({
        jobId: 'job-1',
        progress: 5,
        status: 'downloading',
        speedBytesPerSec: 512,
        etaSeconds: 60,
        bytesDownloaded: 0,
        totalBytes: 0,
      }),
    )

    expect(state.jobs[0]?.progress).toBe(5)
  })

  it('remove job e ignora progresso apos cancelar', () => {
    const downloading = { ...baseJob, status: 'downloading' as const, progress: 40 }
    const afterCancel = queueReducer(
      { jobs: [downloading], ...baseState },
      { type: cancelJob.fulfilled.type, payload: 'job-1' },
    )

    expect(afterCancel.jobs).toHaveLength(0)
    expect(afterCancel.dismissedJobIds).toContain('job-1')

    const afterProgress = queueReducer(
      afterCancel,
      jobProgressReceived({
        jobId: 'job-1',
        progress: 50,
        status: 'downloading',
        speedBytesPerSec: 1024,
        etaSeconds: 60,
        bytesDownloaded: 500,
        totalBytes: 1000,
      }),
    )

    expect(afterProgress.jobs).toHaveLength(0)
  })

  it('nao repoe jobs cancelados apos fetchJobs', () => {
    const downloading = { ...baseJob, status: 'downloading' as const, progress: 40 }
    const afterCancel = queueReducer(
      { jobs: [downloading], ...baseState },
      { type: cancelJob.fulfilled.type, payload: 'job-1' },
    )

    const afterFetch = queueReducer(afterCancel, {
      type: fetchJobs.fulfilled.type,
      payload: [{ ...downloading, progress: 55 }],
    })

    expect(afterFetch.jobs).toHaveLength(0)
  })

  it('nao repoe jobs removidos da biblioteca apos fetchJobs', () => {
    const extracted = { ...baseJob, status: 'extracted' as const, progress: 100 }
    const afterRemove = queueReducer(
      { jobs: [extracted], ...baseState },
      removeJobLocally('job-1'),
    )

    expect(afterRemove.jobs).toHaveLength(0)
    expect(afterRemove.dismissedJobIds).toContain('job-1')

    const afterFetch = queueReducer(
      afterRemove,
      {
        type: fetchJobs.fulfilled.type,
        payload: [{ ...extracted, status: 'completed' }],
      },
    )

    expect(afterFetch.jobs).toHaveLength(0)
  })
})
