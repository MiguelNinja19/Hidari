import { CatalogCover } from '../../shared/components/CatalogCover'
import { Button } from '../../shared/components/ui/Button'
import type { DownloadJob } from '../../shared/types/contracts'
import type { ResolvedCover } from '../covers/useGameCovers'

type DownloadsPageProps = {
  jobs: DownloadJob[]
  queueLoading: boolean
  queueError: string | null
  downloadsBooting: boolean
  savePathError: string
  actionMessage: string
  isTorrentMetadataPhase: (job: DownloadJob) => boolean
  resolveJobProgressPercent: (job: DownloadJob) => number
  formatProgressPercent: (job: DownloadJob) => string
  formatSpeed: (speedBytesPerSec?: number) => string
  formatEta: (seconds?: number) => string | null
  jobStatusLabel: (job: DownloadJob) => string
  showEtaForJob: (job: DownloadJob) => boolean
  jobTransferDetail: (job: DownloadJob) => string
  onOpenFolder: (jobId: string) => Promise<void>
  onPauseJob: (jobId: string) => Promise<void>
  onResumeJob: (jobId: string) => Promise<void>
  onCancelJob: (jobId: string) => Promise<void>
  onClearCompleted: () => Promise<void>
  onPauseAll: () => Promise<void>
  resolveCover: (title: string, catalogCoverUrl?: string | null) => ResolvedCover
  invalidateLocalCover: (title: string, coverUrl?: string | null) => void
}

function queuePrimaryAction(
  job: DownloadJob,
  onPauseJob: (jobId: string) => Promise<void>,
  onResumeJob: (jobId: string) => Promise<void>,
) {
  if (job.status === 'paused' || job.status === 'failed') {
    return {
      label: 'Retomar',
      onClick: () => void onResumeJob(job.id),
    }
  }

  if (['downloading', 'pending', 'retrying', 'seeding'].includes(job.status)) {
    return {
      label: 'Pausar',
      onClick: () => void onPauseJob(job.id),
    }
  }

  return null
}

export function DownloadsPage({
  jobs,
  queueLoading,
  queueError,
  downloadsBooting,
  savePathError,
  actionMessage,
  isTorrentMetadataPhase,
  resolveJobProgressPercent,
  formatProgressPercent,
  formatSpeed,
  formatEta,
  jobStatusLabel,
  showEtaForJob,
  jobTransferDetail,
  onOpenFolder,
  onPauseJob,
  onResumeJob,
  onCancelJob,
  onClearCompleted,
  onPauseAll,
  resolveCover,
  invalidateLocalCover,
}: DownloadsPageProps) {
  const activeJobs = jobs.filter((job) => job.status !== 'cancelled')
  const combinedSpeed = activeJobs.reduce((sum, job) => sum + (job.speedBps ?? 0), 0)

  const progressWidth = (job: DownloadJob) => {
    const value = resolveJobProgressPercent(job)
    if (value <= 0) return 0
    return Math.max(2, Math.min(100, value))
  }

  return (
    <section className="downloads-page">
      <header className="page-toolbar page-toolbar--end">
        {combinedSpeed > 0 ? (
          <span className="toolbar-meta">{formatSpeed(combinedSpeed)}</span>
        ) : null}
        <button className="btn btn-outline btn--compact" type="button" onClick={() => void onPauseAll()}>
          Pausar
        </button>
        <button
          className="btn btn-outline btn--compact"
          type="button"
          onClick={() => void onClearCompleted()}
        >
          Limpar
        </button>
      </header>

      {queueError ? <p className="browse-note browse-note--error">{queueError}</p> : null}
      {savePathError ? <p className="browse-note browse-note--error">{savePathError}</p> : null}
      {actionMessage ? <p className="browse-note">{actionMessage}</p> : null}
      {queueLoading || downloadsBooting ? (
        <p className="browse-note">A carregar…</p>
      ) : null}

      {activeJobs.length > 0 ? (
        <ul className="download-list download-list--compact">
          {activeJobs.map((job) => {
            const metadataPhase = isTorrentMetadataPhase(job)
            const cover = resolveCover(job.title)
            const primary = queuePrimaryAction(job, onPauseJob, onResumeJob)
            const canCancel =
              job.status !== 'cancelled' && !['completed', 'extracted'].includes(job.status)

            return (
              <li key={job.id} className="download-row">
                <div className="download-row__thumb">
                  <CatalogCover
                    title={job.title}
                    coverUrl={cover.coverUrl}
                    localPath={cover.localPath}
                    cached={cover.status === 'cached'}
                    status={cover.status}
                    onLocalCoverError={() => invalidateLocalCover(job.title, cover.coverUrl)}
                  />
                </div>

                <div className="download-row__main">
                  <div className="download-row__top">
                    <strong className="download-row__title">{job.title}</strong>
                    <span className="download-row__percent">{formatProgressPercent(job)}</span>
                  </div>

                  <div
                    className={`progress-bar progress-bar--compact${metadataPhase ? ' progress-bar--pulse' : ''}`}
                  >
                    <div
                      className={`progress-fill${metadataPhase ? ' progress-fill--indeterminate' : ''}`}
                      style={metadataPhase ? undefined : { width: `${progressWidth(job)}%` }}
                    />
                  </div>

                  <p className="download-row__meta">
                    {jobStatusLabel(job)}
                    {' · '}
                    {jobTransferDetail(job)}
                    {!metadataPhase && (job.speedBps ?? 0) > 0
                      ? ` · ${formatSpeed(job.speedBps)}`
                      : ''}
                    {showEtaForJob(job) && formatEta(job.etaSeconds)
                      ? ` · ETA ${formatEta(job.etaSeconds)}`
                      : ''}
                  </p>
                  {job.errorMsg ? <p className="download-row__error">{job.errorMsg}</p> : null}
                </div>

                <div className="download-row__actions">
                  {primary ? (
                    <Button
                      variant="primary"
                      size="compact"
                      className="download-row__primary"
                      type="button"
                      onClick={primary.onClick}
                    >
                      {primary.label}
                    </Button>
                  ) : null}
                  <div className="download-row__secondary">
                    <button type="button" className="text-link" onClick={() => void onOpenFolder(job.id)}>
                      Pasta
                    </button>
                    {canCancel ? (
                      <button
                        type="button"
                        className="text-link text-link--danger"
                        onClick={() => void onCancelJob(job.id)}
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        !queueLoading &&
        !downloadsBooting && (
          <div className="browse-idle">
            <p className="browse-idle__text">Vazio.</p>
          </div>
        )
      )}
    </section>
  )
}
