import { describe, expect, it } from 'vitest'
import {
  formatProgressPercent,
  isTorrentMetadataPhase,
  resolveJobProgressPercent,
  resolveJobProgressPercentFromFields,
  shouldShowDownloadPercent,
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

describe('progresso — sem % do aria em metadados', () => {
  it('usa só bytes do conteúdo', () => {
    expect(
      resolveJobProgressPercentFromFields({
        progress: 99,
        bytesDownloaded: 12_500_000_000,
        totalBytes: 50_000_000_000,
        status: 'downloading',
        url: 'magnet:?xt=',
      }),
    ).toBe(25)
  })

  it('ignora 100% do aria sem conteúdo', () => {
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

  it('NUNCA mostra 100% com mensagem "A obter o conteúdo"', () => {
    const job = magnetJob({
      status: 'completed',
      progress: 100,
      bytesDownloaded: 0,
      totalBytes: 0,
      extractionStatus: 'skipped',
      errorMsg: 'A obter o conteúdo do torrent…',
    })
    expect(shouldShowDownloadPercent(job)).toBe(false)
    expect(formatProgressPercent(job)).toBe('')
    expect(resolveJobProgressPercent(job)).toBe(0)
  })

  it('NUNCA mostra 100% com skipped + 6 KB', () => {
    const job = magnetJob({
      status: 'completed',
      progress: 100,
      bytesDownloaded: 6_100,
      totalBytes: 6_100,
      extractionStatus: 'skipped',
      errorMsg: 'A obter o conteúdo do torrent…',
    })
    expect(formatProgressPercent(job)).toBe('')
    expect(isTorrentMetadataPhase(job)).toBe(true)
  })

  it('sem número na fase de metadados', () => {
    expect(formatProgressPercent(magnetJob({ progress: 100 }))).toBe('')
  })

  it('mostra 100% só quando skipped sem mensagem de obter e sem tamanho minúsculo', () => {
    const job = magnetJob({
      status: 'completed',
      progress: 100,
      bytesDownloaded: 0,
      totalBytes: 0,
      extractionStatus: 'skipped',
      errorMsg: null,
    })
    expect(formatProgressPercent(job)).toBe('100%')
  })

  it('mensagem sticky "A obter" NÃO bloqueia se já há GB de conteúdo', () => {
    const job = magnetJob({
      status: 'completed',
      progress: 100,
      bytesDownloaded: 8_000_000_000,
      totalBytes: 8_000_000_000,
      extractionStatus: 'skipped',
      errorMsg: 'A obter o conteúdo do torrent…',
    })
    expect(formatProgressPercent(job)).toBe('100%')
    expect(shouldShowDownloadPercent(job)).toBe(true)
  })

  it('mostra % pelos bytes reais', () => {
    const job = magnetJob({
      bytesDownloaded: 5_000_000_000,
      totalBytes: 50_000_000_000,
      progress: 99,
    })
    expect(formatProgressPercent(job)).toBe('10%')
  })

  it('NUNCA mostra 100% com skipped se bytes ainda estão a meio', () => {
    const job = magnetJob({
      status: 'downloading',
      progress: 100,
      bytesDownloaded: 1_070_000_000,
      totalBytes: 2_010_000_000,
      extractionStatus: 'skipped',
      speedBps: 3_600_000,
    })
    expect(formatProgressPercent(job)).toBe('53%')
    expect(resolveJobProgressPercent(job)).toBeCloseTo(53.23, 0)
    expect(shouldShowDownloadPercent(job)).toBe(true)
  })
})
