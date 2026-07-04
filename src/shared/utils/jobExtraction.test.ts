import { describe, expect, it } from 'vitest'
import { jobNeedsExtraction } from './jobExtraction'
import type { DownloadJob } from '../types/contracts'

const baseJob: DownloadJob = {
  id: '1',
  title: 'Game',
  url: 'magnet:?xt=',
  destPath: 'D:\\Games\\Game',
  status: 'downloading',
  priority: 0,
  progress: 0,
  bytesDownloaded: 0,
  totalBytes: 0,
  errorMsg: null,
  createdAt: '',
  updatedAt: '',
}

describe('jobNeedsExtraction', () => {
  it('returns true for completed and seeding', () => {
    expect(jobNeedsExtraction({ ...baseJob, status: 'completed' })).toBe(true)
    expect(jobNeedsExtraction({ ...baseJob, status: 'seeding' })).toBe(true)
  })

  it('returns false for extracted or extracting', () => {
    expect(jobNeedsExtraction({ ...baseJob, status: 'extracted' })).toBe(false)
    expect(jobNeedsExtraction({ ...baseJob, status: 'extracting' })).toBe(false)
  })

  it('returns true when progress reached 100 while seeding', () => {
    expect(jobNeedsExtraction({ ...baseJob, status: 'seeding', progress: 100 })).toBe(true)
  })
})
