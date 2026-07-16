import { describe, expect, it } from 'vitest'
import {
  isDownloadReadyForNotify,
  resolveDownloadNotifyKind,
} from './downloadNotifyKind'

describe('resolveDownloadNotifyKind', () => {
  it('não notifica no bootstrap (sem estado anterior)', () => {
    expect(
      resolveDownloadNotifyKind(null, {
        status: 'completed',
        extractionStatus: 'skipped',
        progress: 100,
      }),
    ).toBeNull()
  })

  it('não notifica downloading → completed sem skipped', () => {
    expect(
      resolveDownloadNotifyKind(
        { status: 'downloading', extractionStatus: null, progress: 50 },
        { status: 'completed', extractionStatus: null, progress: 100 },
      ),
    ).toBeNull()
  })

  it('não notifica skipped prematuro (metadados / progresso baixo)', () => {
    expect(
      resolveDownloadNotifyKind(
        { status: 'downloading', extractionStatus: null, progress: 0 },
        {
          status: 'completed',
          extractionStatus: 'skipped',
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
        },
      ),
    ).toBeNull()
  })

  it('notifica install quando extractionStatus passa a skipped com download completo', () => {
    expect(
      resolveDownloadNotifyKind(
        { status: 'completed', extractionStatus: null, progress: 100 },
        { status: 'completed', extractionStatus: 'skipped', progress: 100 },
      ),
    ).toBe('install')
  })

  it('notifica install quando chega completed já com skipped e 100%', () => {
    expect(
      resolveDownloadNotifyKind(
        { status: 'downloading', extractionStatus: null, progress: 90 },
        { status: 'completed', extractionStatus: 'skipped', progress: 100 },
      ),
    ).toBe('install')
  })

  it('notifica install quando bytes confirmam conclusão mesmo com progress atrasado', () => {
    const total = 600 * 1024 * 1024
    expect(
      resolveDownloadNotifyKind(
        {
          status: 'downloading',
          extractionStatus: null,
          progress: 40,
          bytesDownloaded: total * 0.4,
          totalBytes: total,
        },
        {
          status: 'completed',
          extractionStatus: 'skipped',
          progress: 40,
          bytesDownloaded: total,
          totalBytes: total,
        },
      ),
    ).toBe('install')
  })

  it('não notifica de novo se já estava pronto para instalar', () => {
    expect(
      resolveDownloadNotifyKind(
        { status: 'completed', extractionStatus: 'skipped', progress: 100 },
        { status: 'seeding', extractionStatus: 'skipped', progress: 100 },
      ),
    ).toBeNull()
  })

  it('notifica play em extracting → extracted', () => {
    expect(
      resolveDownloadNotifyKind(
        { status: 'extracting', extractionStatus: null, progress: 100 },
        { status: 'extracted', extractionStatus: 'extracted', progress: 100 },
      ),
    ).toBe('play')
  })

  it('isDownloadReadyForNotify exige progresso alto ou bytes reais', () => {
    expect(isDownloadReadyForNotify({ status: 'completed', progress: 100 })).toBe(true)
    expect(isDownloadReadyForNotify({ status: 'completed', progress: 0 })).toBe(false)
    expect(
      isDownloadReadyForNotify({
        status: 'completed',
        progress: 10,
        bytesDownloaded: 10,
        totalBytes: 100,
      }),
    ).toBe(false)
  })
})
