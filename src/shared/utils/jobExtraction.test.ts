import { describe, expect, it } from 'vitest'
import { jobCanExtract, jobNeedsExtraction } from './jobExtraction'
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
  it('pede extração quando o download terminou', () => {
    expect(jobNeedsExtraction({ ...baseJob, status: 'completed' })).toBe(true)
    expect(jobNeedsExtraction({ ...baseJob, status: 'seeding', progress: 100 })).toBe(true)
  })

  it('não pede extração se já foi saltada ou feita', () => {
    expect(
      jobNeedsExtraction({ ...baseJob, status: 'completed', extractionStatus: 'skipped' }),
    ).toBe(false)
    expect(
      jobNeedsExtraction({ ...baseJob, status: 'completed', extractionStatus: 'extracted' }),
    ).toBe(false)
  })
})

describe('jobCanExtract', () => {
  it('mostra Extrair em completed/seeding quando ainda falta extrair', () => {
    expect(jobCanExtract({ ...baseJob, status: 'completed' })).toBe(true)
    expect(jobCanExtract({ ...baseJob, status: 'seeding', progress: 100 })).toBe(true)
    expect(
      jobCanExtract({ ...baseJob, status: 'completed', extractionStatus: 'failed' }),
    ).toBe(true)
  })

  it('esconde Extrair quando skipped (sem arquivo para extrair)', () => {
    expect(
      jobCanExtract({ ...baseJob, status: 'completed', extractionStatus: 'skipped' }),
    ).toBe(false)
    expect(
      jobCanExtract({ ...baseJob, status: 'seeding', progress: 100, extractionStatus: 'skipped' }),
    ).toBe(false)
  })

  it('esconde Extrair quando já extracted', () => {
    expect(
      jobCanExtract({ ...baseJob, status: 'completed', extractionStatus: 'extracted' }),
    ).toBe(false)
    expect(jobCanExtract({ ...baseJob, status: 'cancelled' })).toBe(false)
  })
})

describe('activeJobBlocksLibraryFolder', () => {
  const root = 'D:\\Games\\Downloads'

  it('não bloqueia pastas irmãs quando o job usa a pasta raiz de downloads', async () => {
    const { activeJobBlocksLibraryFolder } = await import('./jobExtraction')
    expect(activeJobBlocksLibraryFolder(`${root}\\Cuphead`, root, root)).toBe(false)
    expect(activeJobBlocksLibraryFolder(`${root}\\Other Game`, root, root)).toBe(false)
  })

  it('bloqueia pasta com o mesmo destino específico do job', async () => {
    const { activeJobBlocksLibraryFolder } = await import('./jobExtraction')
    const jobDest = `${root}\\SpongeBob`
    expect(activeJobBlocksLibraryFolder(jobDest, jobDest, root)).toBe(true)
  })

  it('jobPathsOverlap normaliza barras mistas', async () => {
    const { jobPathsOverlap } = await import('./jobExtraction')
    expect(jobPathsOverlap('D:\\Games\\a', 'D:/Games/a')).toBe(true)
    expect(jobPathsOverlap('D:\\Games\\a\\sub', 'D:/Games/a')).toBe(true)
  })
})
