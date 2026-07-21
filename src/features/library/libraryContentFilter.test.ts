import { describe, expect, it } from 'vitest'
import type { DownloadJob } from '../../shared/types/contracts'
import { libraryEntryHasPlayableContent } from './libraryContentFilter'
import { pathStateKey, itemPathCtx } from './libraryPathState'
import type { LibraryEntry } from './types'
import type { PathStateMap } from './libraryControllerTypes'

const playableState = {
  hasGame: true,
  playable: true,
  needsInstall: false,
  needsExtraction: false,
  installPath: null,
  customGameRoot: null,
  launchPath: null,
}

describe('libraryEntryHasPlayableContent', () => {
  it('esconde job com extract falhado', () => {
    const item: LibraryEntry = {
      id: '1',
      title: 'Power Rangers',
      status: 'completed',
      destPath: 'J:\\dddd\\Power Rangers',
      kind: 'job',
      job: {
        id: '1',
        title: 'Power Rangers',
        status: 'completed',
        extractionStatus: 'failed',
      } as DownloadJob,
    }
    expect(libraryEntryHasPlayableContent(item, {})).toBe(false)
  })

  it('mostra quando há .exe jogável', () => {
    const item: LibraryEntry = {
      id: 'folder-1',
      title: 'Game',
      status: 'installed',
      destPath: 'J:\\dddd\\Game',
      kind: 'folder',
    }
    const key = pathStateKey(item.destPath, itemPathCtx(item))
    const states: PathStateMap = { [key]: playableState }
    expect(libraryEntryHasPlayableContent(item, states)).toBe(true)
  })

  it('esconde pasta só com arquivo (precisa extrair)', () => {
    const item: LibraryEntry = {
      id: 'folder-2',
      title: 'Only Rar',
      status: 'installed',
      destPath: 'J:\\dddd\\Only Rar',
      kind: 'folder',
    }
    const key = pathStateKey(item.destPath, itemPathCtx(item))
    const states: PathStateMap = {
      [key]: {
        hasGame: false,
        playable: false,
        needsInstall: false,
        needsExtraction: true,
        installPath: null,
        customGameRoot: null,
        launchPath: null,
      },
    }
    expect(libraryEntryHasPlayableContent(item, states)).toBe(false)
  })
})
