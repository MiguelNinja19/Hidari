import { describe, expect, it } from 'vitest'
import type { DownloadJob } from '../../shared/types/contracts'
import { isActiveQueueJob, jobBelongsInLibrary } from './libraryItemState'

describe('jobBelongsInLibrary', () => {
  it('só aceita download concluído', () => {
    const active = { status: 'paused', url: '', totalBytes: 0, bytesDownloaded: 0 } as DownloadJob
    const done = {
      status: 'completed',
      url: 'https://example/setup.exe',
      totalBytes: 80_000_000,
      bytesDownloaded: 80_000_000,
      errorMsg: null,
    } as DownloadJob
    const stickyDone = {
      ...done,
      url: 'magnet:?xt=urn:btih:abc',
      errorMsg: 'A obter o conteúdo do torrent…',
    } as DownloadJob
    expect(isActiveQueueJob(active)).toBe(true)
    expect(jobBelongsInLibrary(active)).toBe(false)
    expect(jobBelongsInLibrary({ status: 'downloading', url: '', totalBytes: 0, bytesDownloaded: 0 } as DownloadJob)).toBe(false)
    expect(jobBelongsInLibrary({ status: 'failed', url: '', totalBytes: 0, bytesDownloaded: 0 } as DownloadJob)).toBe(false)
    expect(jobBelongsInLibrary({ status: 'verify_failed', url: '', totalBytes: 80_000_000, bytesDownloaded: 80_000_000 } as DownloadJob)).toBe(true)
    expect(jobBelongsInLibrary(done)).toBe(true)
    expect(jobBelongsInLibrary(stickyDone)).toBe(true)
    expect(jobBelongsInLibrary({ status: 'extracted', url: '', totalBytes: 80_000_000, bytesDownloaded: 80_000_000 } as DownloadJob)).toBe(true)
    expect(jobBelongsInLibrary({ status: 'seeding', url: 'magnet:?xt=urn:btih:x', totalBytes: 80_000_000, bytesDownloaded: 80_000_000 } as DownloadJob)).toBe(true)
    expect(jobBelongsInLibrary({ status: 'cancelled', url: '', totalBytes: 0, bytesDownloaded: 0 } as DownloadJob)).toBe(false)
  })

  it('aceita paused com transferência 100%', () => {
    const pausedDone = {
      status: 'paused',
      url: 'magnet:?xt=urn:btih:abc',
      totalBytes: 618_035_125,
      bytesDownloaded: 618_035_125,
      progress: 100,
      errorMsg: null,
    } as DownloadJob
    expect(jobBelongsInLibrary(pausedDone)).toBe(true)
    expect(jobBelongsInLibrary({ ...pausedDone, bytesDownloaded: 100_000_000 })).toBe(false)
  })

  it('aceita 100% ainda em downloading', () => {
    expect(jobBelongsInLibrary({
      status: 'downloading',
      url: 'magnet:?xt=urn:btih:abc',
      totalBytes: 2_010_000_000,
      bytesDownloaded: 2_010_000_000,
      progress: 100,
      errorMsg: 'download_stalled_recovering: Sem atividade',
    } as DownloadJob)).toBe(true)
  })

  it('rejeita extract falhado (ex.: senha) — fica só em Downloads', () => {
    expect(jobBelongsInLibrary({
      status: 'completed',
      url: 'magnet:?xt=urn:btih:abc',
      totalBytes: 80_000_000,
      bytesDownloaded: 80_000_000,
      extractionStatus: 'failed',
      errorMsg: 'archive_password_required',
    } as DownloadJob)).toBe(false)
  })

  it('rejeita completed/skipped a meio do download', () => {
    const mid = {
      status: 'completed',
      url: 'magnet:?xt=urn:btih:abc',
      totalBytes: 2_010_000_000,
      bytesDownloaded: 1_070_000_000,
      progress: 100,
      extractionStatus: 'skipped',
      errorMsg: null,
    } as DownloadJob
    expect(jobBelongsInLibrary(mid)).toBe(false)
    expect(jobBelongsInLibrary({ ...mid, status: 'skipped' })).toBe(false)
  })
})
