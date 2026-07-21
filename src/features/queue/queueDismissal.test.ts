import { describe, expect, it } from 'vitest'
import {
  cancelJob,
  fetchJobs,
  jobProgressReceived,
  queueReducer,
  removeJobLocally,
} from './queueSlice'
import { baseQueueJob, baseQueueState } from './queueTestFixtures'

describe('queue dismissal', () => {
  it('mantém job cancelado na lista e ignora progresso', () => {
    const downloading = { ...baseQueueJob, status: 'downloading' as const, progress: 40 }
    const afterCancel = queueReducer(
      { jobs: [downloading], ...baseQueueState },
      { type: cancelJob.fulfilled.type, payload: 'job-1' },
    )
    expect(afterCancel.jobs).toHaveLength(1)
    expect(afterCancel.jobs[0]?.status).toBe('cancelled')
    expect(afterCancel.dismissedJobIds).not.toContain('job-1')
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
    expect(afterProgress.jobs).toHaveLength(1)
    expect(afterProgress.jobs[0]?.status).toBe('cancelled')
    expect(afterProgress.jobs[0]?.progress).toBe(40)
  })

  it('mantém jobs cancelados após fetch mesmo sem o sidecar', () => {
    const downloading = { ...baseQueueJob, status: 'downloading' as const, progress: 40 }
    const afterCancel = queueReducer(
      { jobs: [downloading], ...baseQueueState },
      { type: cancelJob.fulfilled.type, payload: 'job-1' },
    )
    const afterFetch = queueReducer(afterCancel, {
      type: fetchJobs.fulfilled.type,
      payload: [],
    })
    expect(afterFetch.jobs).toHaveLength(1)
    expect(afterFetch.jobs[0]?.status).toBe('cancelled')
  })

  it('não repõe jobs removidos da biblioteca', () => {
    const extracted = { ...baseQueueJob, status: 'extracted' as const, progress: 100 }
    const afterRemove = queueReducer(
      { jobs: [extracted], ...baseQueueState },
      removeJobLocally('job-1'),
    )
    expect(afterRemove.jobs).toHaveLength(0)
    expect(afterRemove.dismissedJobIds).toContain('job-1')
    const afterFetch = queueReducer(afterRemove, {
      type: fetchJobs.fulfilled.type,
      payload: [{ ...extracted, status: 'completed' }],
    })
    expect(afterFetch.jobs).toHaveLength(0)
  })
})
