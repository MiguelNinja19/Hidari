import { describe, expect, it } from 'vitest'
import { jobProgressReceived, queueReducer } from './queueSlice'
import { baseQueueJob, baseQueueState } from './queueTestFixtures'

describe('queue progress', () => {
  it('guarda bytes e progresso bruto do sidecar', () => {
    const state = queueReducer(
      {
        jobs: [{ ...baseQueueJob, status: 'downloading', progress: 0, bytesDownloaded: 0, totalBytes: 0 }],
        ...baseQueueState,
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
      { jobs: [{ ...baseQueueJob, status: 'downloading', errorMsg: null }], ...baseQueueState },
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

  it('mantém progress inflado sem bytes no magnet', () => {
    const state = queueReducer(
      {
        jobs: [{
          ...baseQueueJob,
          status: 'downloading',
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
          url: 'magnet:?xt=urn:btih:abc',
        }],
        ...baseQueueState,
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

  it('usa percentagem quando bytes ainda não existem', () => {
    const state = queueReducer(
      {
        jobs: [{
          ...baseQueueJob,
          status: 'downloading',
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
          url: 'magnet:?xt=urn:btih:abc',
        }],
        ...baseQueueState,
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
})
