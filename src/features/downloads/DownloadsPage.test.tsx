import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DownloadsPage } from './DownloadsPage'
import type { DownloadJob } from '../../shared/types/contracts'

afterEach(() => {
  cleanup()
})

const finishedJob: DownloadJob = {
  id: 'job-1',
  title: 'Test Game',
  url: 'magnet:?xt=urn:btih:abc',
  destPath: 'C:\\Games\\Test',
  status: 'extracted',
  priority: 0,
  progress: 100,
  bytesDownloaded: 8_000_000_000,
  totalBytes: 8_000_000_000,
  errorMsg: null,
  extractionStatus: 'skipped',
  createdAt: '',
  updatedAt: '',
}

const awaitingJob: DownloadJob = {
  id: 'job-2',
  title: 'Tiny Metadata',
  url: 'magnet:?xt=urn:btih:def',
  destPath: 'C:\\Games\\Tiny',
  status: 'completed',
  priority: 0,
  progress: 100,
  bytesDownloaded: 6_000,
  totalBytes: 6_000,
  errorMsg: 'A obter o conteúdo do torrent…',
  extractionStatus: 'skipped',
  createdAt: '',
  updatedAt: '',
}

describe('DownloadsPage', () => {
  const commonProps = {
    actionBusyId: null as string | null,
    isTorrentMetadataPhase: () => false,
    resolveJobProgressPercent: () => 100,
    formatProgressPercent: () => '100%',
    onPauseJob: async () => {},
    onResumeJob: async () => {},
    onCancelJob: async () => {},
    onClearCompleted: async () => {},
    onPauseAll: async () => {},
    onOpenJobFolder: () => {},
    onRemoveJob: async () => {},
    onExtractJob: async () => {},
    onResumeAll: async () => {},
    resolveCover: () => ({ coverUrl: null, localPath: null, status: 'idle' as const }),
    invalidateLocalCover: () => {},
  }

  it('mostra Instalar como atalho para a Biblioteca quando o download terminou de verdade', () => {
    const onGoLibrary = vi.fn()

    render(
      <DownloadsPage jobs={[finishedJob]} onGoLibrary={onGoLibrary} {...commonProps} />,
    )

    const installBtn = screen.getByRole('button', { name: 'Instalar' })
    expect(installBtn).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pasta' })).toBeTruthy()

    fireEvent.click(installBtn)
    expect(onGoLibrary).toHaveBeenCalledTimes(1)
  })

  it('não mostra Instalar enquanto ainda está a obter o conteúdo / metadados', () => {
    render(
      <DownloadsPage jobs={[awaitingJob]} onGoLibrary={() => {}} {...commonProps} />,
    )

    expect(screen.queryByRole('button', { name: 'Instalar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy()
  })

  it('mostra Instalar e secção concluídos quando 100% ainda está em downloading', () => {
    const stuck: DownloadJob = {
      id: 'job-3',
      title: 'Mega Man',
      url: 'magnet:?xt=urn:btih:mm',
      destPath: 'C:\\Games\\MM',
      status: 'downloading',
      priority: 0,
      progress: 100,
      bytesDownloaded: 2_010_000_000,
      totalBytes: 2_010_000_000,
      errorMsg: 'download_stalled_recovering: Sem atividade — a retomar automaticamente…',
      createdAt: '',
      updatedAt: '',
    }
    render(
      <DownloadsPage jobs={[stuck]} onGoLibrary={() => {}} {...commonProps} />,
    )
    expect(screen.getByRole('button', { name: 'Instalar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Limpar concluídos' })).toBeTruthy()
    expect(screen.getByText('1 concluído(s)')).toBeTruthy()
  })
})
