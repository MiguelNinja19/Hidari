import { describe, expect, it } from 'vitest'
import type { LibraryEntry } from '../../features/library/types'
import type { LocalLibraryItem } from '../types/contracts'
import {
  isFileLockDeleteError,
  resolveLibraryDeletePaths,
  shouldUninstallInstalledFiles,
} from './libraryDelete'

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

  it('também apaga ficheiros .torrent e .aria2 relacionados', () => {
    const items: LocalLibraryItem[] = [
      {
        name: 'Stardew',
        path: 'D:\\Games\\Downloads\\Stardew',
        isDir: true,
        sizeBytes: 0,
        modifiedAt: 1,
      },
      {
        name: 'Stardew.torrent',
        path: 'D:\\Games\\Downloads\\Stardew.torrent',
        isDir: false,
        sizeBytes: 1200,
        modifiedAt: 2,
      },
      {
        name: 'Stardew.aria2',
        path: 'D:\\Games\\Downloads\\Stardew.aria2',
        isDir: false,
        sizeBytes: 80,
        modifiedAt: 3,
      },
      {
        name: 'OutroJogo.torrent',
        path: 'D:\\Games\\Downloads\\OutroJogo.torrent',
        isDir: false,
        sizeBytes: 900,
        modifiedAt: 4,
      },
    ]

    const paths = resolveLibraryDeletePaths(jobItem, items, 'D:\\Games\\Downloads')
    expect(paths).toEqual(
      expect.arrayContaining([
        'D:\\Games\\Downloads\\Stardew',
        'D:\\Games\\Downloads\\Stardew.torrent',
        'D:\\Games\\Downloads\\Stardew.aria2',
      ]),
    )
    expect(paths).not.toContain('D:\\Games\\Downloads\\OutroJogo.torrent')
  })
})

describe('shouldUninstallInstalledFiles', () => {
  it('liga uninstall quando checkbox ativo e há pastas instaladas', () => {
    expect(shouldUninstallInstalledFiles(true, ['D:\\Games\\Galaxy Rangers'])).toBe(true)
  })

  it('não chama uninstall com checkbox desligado', () => {
    expect(shouldUninstallInstalledFiles(false, ['D:\\Games\\Galaxy Rangers'])).toBe(false)
  })

  it('não chama uninstall sem pastas instaladas', () => {
    expect(shouldUninstallInstalledFiles(true, [])).toBe(false)
  })
})

describe('isFileLockDeleteError', () => {
  it('detecta os error 32', () => {
    expect(
      isFileLockDeleteError(new Error('could_not_delete_directory: O arquivo já está sendo usado por outro processo. (os error 32)')),
    ).toBe(true)
  })
})
