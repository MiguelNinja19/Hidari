import { describe, expect, it } from 'vitest'
import { normalizeDownloadJob, parseJobsPayload } from './queueApi'

describe('parseJobsPayload', () => {
  it('reads jobs from wrapped object', () => {
    const rows = parseJobsPayload({
      jobs: [{ id: '1', title: 'A', status: 'pending' }],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('1')
  })

  it('reads plain array', () => {
    const rows = parseJobsPayload([{ id: '2', title: 'B' }])
    expect(rows).toHaveLength(1)
  })
})

describe('normalizeDownloadJob', () => {
  it('normalizes camelCase fields', () => {
    const job = normalizeDownloadJob({
      id: '1',
      title: 'Game',
      url: 'magnet:?xt=',
      destPath: 'D:\\Games',
      status: 'downloading',
      priority: 1,
      progress: 42,
      bytesDownloaded: 100,
      totalBytes: 200,
      speedBps: 1024,
      etaSeconds: 60,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    })

    expect(job.id).toBe('1')
    expect(job.destPath).toBe('D:\\Games')
    expect(job.bytesDownloaded).toBe(100)
    expect(job.speedBps).toBe(1024)
  })

  it('normalizes snake_case fields from sidecar', () => {
    const job = normalizeDownloadJob({
      id: '2',
      title: 'Other',
      url: 'http://example.com',
      dest_path: 'C:\\Downloads',
      status: 'completed',
      bytes_downloaded: 500,
      total_bytes: 500,
      speed_bps: 0,
      eta_seconds: 0,
      created_at: '2026-01-01',
    })

    expect(job.destPath).toBe('C:\\Downloads')
    expect(job.bytesDownloaded).toBe(500)
    expect(job.totalBytes).toBe(500)
  })

  it('coerces fractional progress to percent', () => {
    const job = normalizeDownloadJob({
      id: '3',
      title: 'Torrent',
      url: 'magnet:?xt=',
      dest_path: 'D:\\Games',
      status: 'downloading',
      progress: 0.42,
      bytes_downloaded: 420,
      total_bytes: 1000,
    })

    expect(job.progress).toBe(0.42)
  })
})
