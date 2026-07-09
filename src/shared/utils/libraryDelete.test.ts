import { describe, expect, it } from 'vitest'
import type { LibraryEntry } from '../../features/library/types'
import type { LocalLibraryItem } from '../types/contracts'
import { isFileLockDeleteError, resolveLibraryDeletePaths } from './libraryDelete'

describe('resolveLibraryDeletePaths', () => {
  const jobItem: LibraryEntry = {
    id: 'job-1',
    title: 'Stardew Valley (v1.6.0, MULTi9)',
    status: 'completed',
    destPath: 'D:\\Games\\Downloads',
    kind: 'job',
  }

  const folders: LocalLibraryItem[] = [
    {
      name: 'Stardew',
      path: 'D:\\Games\\Downloads\\Stardew',
      isDir: true,
      sizeBytes: 0,
      modifiedAt: 1,
    },
  ]

  it('não tenta apagar a pasta raiz de downloads', () => {
    const paths = resolveLibraryDeletePaths(jobItem, folders, 'D:\\Games\\Downloads')
    expect(paths).toEqual(['D:\\Games\\Downloads\\Stardew'])
  })

  it('inclui pasta com título completo', () => {
    const item: LibraryEntry = {
      ...jobItem,
      destPath: 'D:\\Games\\Downloads\\Stardew Valley',
    }
    const paths = resolveLibraryDeletePaths(item, [], 'D:\\Games\\Downloads')
    expect(paths).toEqual(['D:\\Games\\Downloads\\Stardew Valley'])
  })
})

describe('isFileLockDeleteError', () => {
  it('detecta os error 32', () => {
    expect(
      isFileLockDeleteError(new Error('could_not_delete_directory: O arquivo já está sendo usado por outro processo. (os error 32)')),
    ).toBe(true)
  })
})
