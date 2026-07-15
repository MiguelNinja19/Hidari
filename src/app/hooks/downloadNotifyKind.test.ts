import { describe, expect, it } from 'vitest'
import { resolveDownloadNotifyKind } from './downloadNotifyKind'

describe('resolveDownloadNotifyKind', () => {
  it('não notifica no bootstrap (sem estado anterior)', () => {
    expect(
      resolveDownloadNotifyKind(null, {
        status: 'completed',
        extractionStatus: 'skipped',
      }),
    ).toBeNull()
  })

  it('não notifica downloading → completed sem skipped', () => {
    expect(
      resolveDownloadNotifyKind(
        { status: 'downloading', extractionStatus: null },
        { status: 'completed', extractionStatus: null },
      ),
    ).toBeNull()
  })

  it('notifica install quando extractionStatus passa a skipped', () => {
    expect(
      resolveDownloadNotifyKind(
        { status: 'completed', extractionStatus: null },
        { status: 'completed', extractionStatus: 'skipped' },
      ),
    ).toBe('install')
  })

  it('notifica install quando chega completed já com skipped', () => {
    expect(
      resolveDownloadNotifyKind(
        { status: 'downloading', extractionStatus: null },
        { status: 'completed', extractionStatus: 'skipped' },
      ),
    ).toBe('install')
  })

  it('não notifica de novo se já estava pronto para instalar', () => {
    expect(
      resolveDownloadNotifyKind(
        { status: 'completed', extractionStatus: 'skipped' },
        { status: 'seeding', extractionStatus: 'skipped' },
      ),
    ).toBeNull()
  })

  it('notifica play em extracting → extracted', () => {
    expect(
      resolveDownloadNotifyKind(
        { status: 'extracting', extractionStatus: null },
        { status: 'extracted', extractionStatus: 'extracted' },
      ),
    ).toBe('play')
  })
})
