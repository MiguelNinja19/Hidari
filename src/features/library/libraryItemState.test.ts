import { describe, expect, it } from 'vitest'
import type { DownloadJob, LibraryPathState } from '../../shared/types/contracts'
import type { LibraryEntry } from './types'
import {
  isJobFinished,
  isPlayableLibraryItem,
  itemAwaitingInstall,
  itemNeedsExtraction,
  showInstallAction,
  showLocateInstallAction,
  showPlayAction,
} from './libraryItemState'

const emptyPathState: Record<string, LibraryPathState> = {}

function jobEntry(job: DownloadJob): LibraryEntry {
  return {
    id: job.id,
    title: job.title,
    status: job.status,
    destPath: job.destPath,
    kind: 'job',
    job,
  }
}

function baseJob(overrides: Partial<DownloadJob> & Pick<DownloadJob, 'id' | 'title' | 'destPath' | 'status'>): DownloadJob {
  return {
    url: 'magnet:?xt=urn:btih:abc',
    priority: 0,
    progress: 100,
    bytesDownloaded: 100_000_000,
    totalBytes: 100_000_000,
    errorMsg: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('libraryItemState', () => {
  it('isJobFinished reconhece extracted e completed', () => {
    expect(isJobFinished({ status: 'extracted' } as DownloadJob)).toBe(true)
    expect(isJobFinished({ status: 'downloading', progress: 50 } as DownloadJob)).toBe(false)
    expect(isJobFinished({ status: 'downloading', progress: 99 } as DownloadJob)).toBe(false)
    expect(isJobFinished({ status: 'completed', progress: 99 } as DownloadJob)).toBe(true)
  })

  it('showInstallAction quando needsInstall', () => {
    const job = baseJob({
      id: '1',
      title: 'Sample Game',
      destPath: 'C:\\Games\\sample',
      status: 'extracted',
    })
    const pathState: Record<string, LibraryPathState> = {
      'job:1': {
        playable: false,
        hasGame: false,
        needsInstall: true,
        needsExtraction: false,
        installPath: 'C:\\Games\\sample\\setup.exe',
      },
    }
    const item = jobEntry(job)
    expect(showInstallAction(item, [job], pathState)).toBe(true)
    expect(showPlayAction(item, [job], pathState)).toBe(false)
    expect(itemAwaitingInstall(item, [job], pathState)).toBe(true)
  })

  it('showPlayAction quando hasGame', () => {
    const job = baseJob({
      id: '2',
      title: 'Ready Game',
      destPath: 'C:\\Games\\ready',
      status: 'extracted',
    })
    const pathState: Record<string, LibraryPathState> = {
      'job:2': {
        playable: true,
        hasGame: true,
        needsInstall: false,
        needsExtraction: false,
        installPath: null,
      },
    }
    const item = jobEntry(job)
    expect(isPlayableLibraryItem(item, [job], pathState)).toBe(true)
    expect(showPlayAction(item, [job], pathState)).toBe(true)
    expect(showInstallAction(item, [job], pathState)).toBe(false)
  })

  it('não mostra localizar pasta antes da verificação do disco', () => {
    const item: LibraryEntry = {
      id: 'folder-cuphead',
      title: 'Cuphead',
      status: 'installed',
      destPath: 'C:\\Games\\Cuphead',
      kind: 'folder',
    }
    expect(showLocateInstallAction(item, [], emptyPathState)).toBe(false)
  })

  it('não mostra instalar durante download activo', () => {
    const job = baseJob({
      id: '3',
      title: 'Downloading Game',
      destPath: 'C:\\Games\\dl',
      status: 'downloading',
      progress: 40,
      bytesDownloaded: 0,
      totalBytes: 0,
    })
    const item = jobEntry(job)
    expect(showInstallAction(item, [job], emptyPathState)).toBe(false)
    expect(itemAwaitingInstall(item, [job], emptyPathState)).toBe(false)
  })

  it('job concluído sem path state NÃO mostra Instalar', () => {
    const job = baseJob({
      id: '4',
      title: 'Done No State',
      destPath: 'C:\\Games\\done',
      status: 'completed',
    })
    const item = jobEntry(job)
    expect(itemAwaitingInstall(item, [job], emptyPathState)).toBe(false)
    expect(showInstallAction(item, [job], emptyPathState)).toBe(false)
  })

  it('com archive mostra Extrair e não Instalar', () => {
    const job = baseJob({
      id: '5',
      title: 'Archive Game',
      destPath: 'C:\\Games\\archive',
      status: 'seeding',
    })
    const pathState: Record<string, LibraryPathState> = {
      'job:5': {
        playable: false,
        hasGame: false,
        needsInstall: false,
        needsExtraction: true,
        installPath: null,
      },
    }
    const item = jobEntry(job)
    expect(itemNeedsExtraction(item, pathState)).toBe(true)
    expect(itemAwaitingInstall(item, [job], pathState)).toBe(false)
    expect(showInstallAction(item, [job], pathState)).toBe(false)
    expect(showPlayAction(item, [job], pathState)).toBe(false)
  })

  it('job concluído sem archive e sem setup → Localizar, não Instalar', () => {
    const job = baseJob({
      id: '6',
      title: 'Odd Payload',
      destPath: 'C:\\Games\\odd',
      status: 'completed',
    })
    const pathState: Record<string, LibraryPathState> = {
      'job:6': {
        playable: false,
        hasGame: false,
        needsInstall: false,
        needsExtraction: false,
        installPath: null,
      },
    }
    const item = jobEntry(job)
    expect(showInstallAction(item, [job], pathState)).toBe(false)
    expect(itemNeedsExtraction(item, pathState)).toBe(false)
    expect(showLocateInstallAction(item, [job], pathState)).toBe(true)
  })

  it('pasta jogável sob raiz de downloads não é bloqueada com defaultDownloadPath', () => {
    const folder: LibraryEntry = {
      id: 'folder-game',
      title: 'Installed Game',
      status: 'installed',
      destPath: 'C:\\Downloads\\Installed Game',
      kind: 'folder',
    }
    const activeJob = baseJob({
      id: 'job-root',
      title: 'Other',
      destPath: 'C:\\Downloads',
      status: 'downloading',
      progress: 10,
      bytesDownloaded: 1_000_000,
      totalBytes: 50_000_000,
    })
    const pathState: Record<string, LibraryPathState> = {
      'c:\\downloads\\installed game::installed game': {
        playable: true,
        hasGame: true,
        needsInstall: false,
        needsExtraction: false,
      },
    }
    expect(showPlayAction(folder, [activeJob], pathState, 'C:\\Downloads')).toBe(true)
    expect(showPlayAction(folder, [activeJob], pathState, '')).toBe(false)
  })
})
