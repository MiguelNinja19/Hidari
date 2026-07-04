import { describe, expect, it } from 'vitest'
import type { LibraryEntry } from '../../features/library/types'
import { dedupeLibraryEntries } from './libraryDedupe'
import { libraryGameKey } from './normalizeTitleKey'

describe('libraryGameKey', () => {
  it('agrupa Terraria com variação de versão', () => {
    expect(libraryGameKey('Terraria')).toBe('terraria')
    expect(libraryGameKey('Terraria - v1.4.5.0 (Bigger & Boulder Update)')).toBe('terraria')
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
})
