import { describe, expect, it } from 'vitest'
import {
  formatProgressPercent,
  isTorrentMetadataPhase,
  resolveJobProgressPercent,
  resolveJobProgressPercentFromFields,
} from './jobProgress'
import type { DownloadJob } from '../types/contracts'

const magnetJob = (overrides: Partial<DownloadJob> = {}): DownloadJob => ({
  id: 'j1',
  title: 'Game',
  url: 'magnet:?xt=urn:btih:abc',
  destPath: 'D:\\Games',
  status: 'downloading',
  priority: 0,
  progress: 0,
  bytesDownloaded: 0,
  totalBytes: 0,
  errorMsg: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('resolveJobProgressPercentFromFields', () => {
  it('usa bytes quando total é conhecido', () => {
    expect(
      resolveJobProgressPercentFromFields({
        progress: 0,
        bytesDownloaded: 250,
        totalBytes: 1000,
        status: 'downloading',
        url: 'magnet:?xt=',
      }),
    ).toBe(25)
  })

  it('ignora progress=1.0 (metadados) sem bytes no torrent', () => {
    expect(
      resolveJobProgressPercentFromFields({
        progress: 1,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'downloading',
        url: 'magnet:?xt=',
      }),
    ).toBe(0)
  })

  it('ignora progress=100 sem bytes transferidos', () => {
    expect(
      resolveJobProgressPercentFromFields({
        progress: 100,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'downloading',
        url: 'magnet:?xt=',
      }),
    ).toBe(0)
  })

  it('aceita percentagem parcial do sidecar com velocidade', () => {
    expect(
      resolveJobProgressPercentFromFields({
        progress: 5,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'downloading',
        url: 'magnet:?xt=',
        speedBps: 512000,
      }),
    ).toBe(5)
  })
})

describe('isTorrentMetadataPhase', () => {
  it('mostra fase de metadados no início do magnet', () => {
    expect(isTorrentMetadataPhase(magnetJob({ progress: 1, bytesDownloaded: 0 }))).toBe(true)
    expect(formatProgressPercent(magnetJob({ progress: 1 }))).toBe('···')
  })

  it('sai da fase de metadados quando há bytes', () => {
    const job = magnetJob({ bytesDownloaded: 100, totalBytes: 1000, progress: 10 })
    expect(isTorrentMetadataPhase(job)).toBe(false)
    expect(resolveJobProgressPercent(job)).toBe(10)
  })
})
