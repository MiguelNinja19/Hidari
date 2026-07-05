import { describe, expect, it } from 'vitest'
import type { DownloadJob, LibraryPathState } from '../../shared/types/contracts'
import type { LibraryEntry } from './types'
import {
  isJobFinished,
  isPlayableLibraryItem,
  itemAwaitingInstall,
  showInstallAction,
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

describe('libraryItemState', () => {
  it('isJobFinished reconhece extracted e completed', () => {
    expect(isJobFinished({ status: 'extracted' } as DownloadJob)).toBe(true)
    expect(isJobFinished({ status: 'downloading', progress: 50 } as DownloadJob)).toBe(false)
    expect(isJobFinished({ status: 'downloading', progress: 99 } as DownloadJob)).toBe(false)
    expect(isJobFinished({ status: 'completed', progress: 99 } as DownloadJob)).toBe(true)
  })

  it('showInstallAction quando needsInstall', () => {
    const job: DownloadJob = {
      id: '1',
      title: 'Sample Game',
      url: 'magnet:?',
      destPath: 'C:\\Games\\sample',
      status: 'extracted',
      priority: 0,
      progress: 100,
      bytesDownloaded: 0,
      totalBytes: 0,
      errorMsg: null,
      createdAt: '',
      updatedAt: '',
    }
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
    const job: DownloadJob = {
      id: '2',
      title: 'Ready Game',
      url: 'magnet:?',
      destPath: 'C:\\Games\\ready',
      status: 'extracted',
      priority: 0,
      progress: 100,
      bytesDownloaded: 0,
      totalBytes: 0,
      errorMsg: null,
      createdAt: '',
      updatedAt: '',
    }
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

  it('não mostra instalar durante download activo', () => {
    const job: DownloadJob = {
      id: '3',
      title: 'Downloading Game',
      url: 'magnet:?',
      destPath: 'C:\\Games\\dl',
      status: 'downloading',
      priority: 0,
      progress: 40,
      bytesDownloaded: 0,
      totalBytes: 0,
      errorMsg: null,
      createdAt: '',
      updatedAt: '',
    }
    const item = jobEntry(job)
    expect(showInstallAction(item, [job], emptyPathState)).toBe(false)
    expect(itemAwaitingInstall(item, [job], emptyPathState)).toBe(false)
  })
})
