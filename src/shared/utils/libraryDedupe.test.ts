import { describe, expect, it } from 'vitest'
import type { LibraryEntry } from '../../features/library/types'
import { dedupeLibraryEntries } from './libraryDedupe'
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
})
