import { describe, expect, it } from 'vitest'
import type { LibraryEntry } from '../../features/library/types'
import type { DownloadJob } from '../types/contracts'
import { dedupeLibraryEntries, findRelatedLibraryJobs } from './libraryDedupe'
import { libraryGameKey, libraryTitlesMatch } from './normalizeTitleKey'

describe('libraryGameKey', () => {
  it('agrupa Terraria com variação de versão', () => {
    expect(libraryGameKey('Terraria')).toBe('terraria')
    expect(libraryGameKey('Terraria - v1.4.5.0 (Bigger & Boulder Update)')).toBe('terraria')
  })

  it('agrupa Stardew Valley com título de repack', () => {
    expect(libraryTitlesMatch('Stardew Valley', 'Stardew Valley (v1.6.0, MULTi9)')).toBe(true)
  })

  it('agrupa pasta abreviada Stardew com título completo', () => {
    expect(libraryTitlesMatch('Stardew', 'Stardew Valley (v1.6.0, MULTi9)')).toBe(true)
  })

  it('agrupa abreviação e título completo do mesmo jogo', () => {
    const abbreviated = libraryGameKey('SBSP - The Patrick Star Game')
    const full = libraryGameKey('SpongeBob SquarePants: The Patrick Star Game')
    expect(libraryTitlesMatch('SBSP - The Patrick Star Game', 'SpongeBob SquarePants: The Patrick Star Game')).toBe(true)
    expect(abbreviated).toBeTruthy()
    expect(full).toBeTruthy()
  })
})

describe('dedupeLibraryEntries', () => {
  const folderPlayable: LibraryEntry = {
    id: 'folder-1',
    title: 'Terraria - v1.4.5.0',
    status: 'installed',
    destPath: 'D:\\Games\\Terraria - v1.4.5.0',
    kind: 'folder',
  }

  const jobInstall: LibraryEntry = {
    id: 'job-1',
    title: 'Terraria',
    status: 'completed',
    destPath: 'D:\\Games\\Terraria',
    kind: 'job',
  }

  it('mantém só a entrada jogável quando há duplicata', () => {
    const score = (item: LibraryEntry) => (item.kind === 'folder' ? 100 : 50)
    const result = dedupeLibraryEntries([jobInstall, folderPlayable], score)
    expect(result).toHaveLength(1)
    expect(result[0]?.kind).toBe('folder')
  })

  it('deduplica Stardew Valley job e pasta', () => {
    const job: LibraryEntry = {
      id: 'job-sv',
      title: 'Stardew Valley (v1.6.0, MULTi9)',
      status: 'completed',
      destPath: 'D:\\Games\\Downloads',
      kind: 'job',
    }
    const folder: LibraryEntry = {
      id: 'folder-sv',
      title: 'Stardew Valley',
      status: 'installed',
      destPath: 'D:\\Games\\Downloads\\Stardew Valley',
      kind: 'folder',
    }
    const result = dedupeLibraryEntries([job, folder], (item) => (item.kind === 'job' ? 90 : 50))
    expect(result).toHaveLength(1)
    expect(result[0]?.kind).toBe('job')
  })

  it('prefere job durante instalação em vez de pasta abreviada', () => {
    const job: LibraryEntry = {
      id: 'job-sv',
      title: 'Stardew Valley (v1.6.0, MULTi9)',
      status: 'completed',
      destPath: 'D:\\Games\\Downloads',
      kind: 'job',
    }
    const folder: LibraryEntry = {
      id: 'folder-sv',
      title: 'Stardew',
      status: 'installed',
      destPath: 'D:\\Games\\Downloads\\Stardew',
      kind: 'folder',
    }
    const score = (item: LibraryEntry) => {
      if (item.kind === 'job') return 90
      if (item.kind === 'folder') return 45
      return 0
    }
    const result = dedupeLibraryEntries([folder, job], score)
    expect(result).toHaveLength(1)
    expect(result[0]?.kind).toBe('job')
  })

  it('não mistura atalho externo .url com pasta/job do mesmo título', () => {
    const external: LibraryEntry = {
      id: 'folder-url',
      title: 'Terraria',
      status: 'installed',
      destPath: 'C:\\Users\\me\\AppData\\external_library\\Terraria.url',
      kind: 'folder',
      external: true,
    }
    const folder: LibraryEntry = {
      id: 'folder-1',
      title: 'Terraria - v1.4.5.0',
      status: 'installed',
      destPath: 'D:\\Games\\Terraria - v1.4.5.0',
      kind: 'folder',
    }
    const result = dedupeLibraryEntries([external, folder], (item) =>
      item.external ? 40 : 100,
    )
    expect(result).toHaveLength(2)
    expect(result.some((item) => item.external)).toBe(true)
    expect(result.some((item) => !item.external)).toBe(true)
  })
})

describe('findRelatedLibraryJobs', () => {
  const makeJob = (partial: Partial<DownloadJob> & Pick<DownloadJob, 'id' | 'title' | 'destPath'>): DownloadJob =>
    ({
      url: '',
      status: 'completed',
      priority: 0,
      progress: 100,
      bytesDownloaded: 0,
      totalBytes: 0,
      errorMsg: null,
      createdAt: '',
      updatedAt: '',
      ...partial,
    })

  it('não associa jobs só pelo título', () => {
    const item: LibraryEntry = {
      id: 'folder-1',
      title: 'Terraria',
      status: 'installed',
      destPath: 'D:\\Games\\Terraria',
      kind: 'folder',
    }
    const jobs = [
      makeJob({ id: 'a', title: 'Terraria', destPath: 'D:\\Games\\Other\\Terraria' }),
      makeJob({ id: 'b', title: 'Hades', destPath: 'D:\\Games\\Hades' }),
    ]
    expect(findRelatedLibraryJobs(item, jobs, 'D:\\Games')).toHaveLength(0)
  })

  it('associa job no mesmo path ou pasta filha', () => {
    const item: LibraryEntry = {
      id: 'folder-1',
      title: 'Terraria',
      status: 'installed',
      destPath: 'D:\\Games\\Terraria',
      kind: 'folder',
    }
    const jobs = [
      makeJob({ id: 'same', title: 'Terraria', destPath: 'D:\\Games\\Terraria' }),
      makeJob({ id: 'child', title: 'Terraria files', destPath: 'D:\\Games\\Terraria\\setup' }),
      makeJob({ id: 'other', title: 'Hades', destPath: 'D:\\Games\\Hades' }),
    ]
    const related = findRelatedLibraryJobs(item, jobs, 'D:\\Games')
    expect(related.map((job) => job.id).sort()).toEqual(['child', 'same'])
  })

  it('não associa pela raiz de downloads', () => {
    const item: LibraryEntry = {
      id: 'job-1',
      title: 'Stardew Valley',
      status: 'completed',
      destPath: 'D:\\Games',
      kind: 'job',
    }
    const jobs = [
      makeJob({ id: 'job-1', title: 'Stardew Valley', destPath: 'D:\\Games' }),
      makeJob({ id: 'job-2', title: 'Hades', destPath: 'D:\\Games\\Hades' }),
      makeJob({ id: 'job-3', title: 'Terraria', destPath: 'D:\\Games\\Terraria' }),
    ]
    const related = findRelatedLibraryJobs(item, jobs, 'D:\\Games')
    expect(related.map((job) => job.id)).toEqual(['job-1'])
  })
})
