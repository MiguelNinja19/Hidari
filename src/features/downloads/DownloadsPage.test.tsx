import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DownloadsPage } from './DownloadsPage'
import type { DownloadJob } from '../../shared/types/contracts'

const baseJob: DownloadJob = {
  id: 'job-1',
  title: 'Test Game',
  url: 'magnet:?xt=urn:btih:abc',
  destPath: 'C:\\Games\\Test',
  status: 'extracted',
  priority: 0,
  progress: 100,
  bytesDownloaded: 1000,
  totalBytes: 1000,
  errorMsg: null,
  createdAt: '',
  updatedAt: '',
}

describe('DownloadsPage', () => {
  it('mostra botão Jogar quando o job está extraído', () => {
    render(
      <DownloadsPage
        jobs={[baseJob]}
        queueLoading={false}
        downloadsBooting={false}
        actionBusyId={null}
        isTorrentMetadataPhase={() => false}
        resolveJobProgressPercent={() => 100}
        formatProgressPercent={() => '100%'}
        onPauseJob={async () => {}}
        onResumeJob={async () => {}}
        onCancelJob={async () => {}}
        onClearCompleted={async () => {}}
        onPauseAll={async () => {}}
        onOpenJobFolder={() => {}}
        onPlayJob={() => {}}
        onGoDiscover={() => {}}
        resolveCover={() => ({ coverUrl: null, localPath: null, status: 'idle' })}
        invalidateLocalCover={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Jogar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pasta' })).toBeTruthy()
  })
})
