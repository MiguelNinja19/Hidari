import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { CatalogCover } from '../../shared/components/CatalogCover'
import { downloadRowDetail } from '../../shared/utils/downloadRowDetail'
import { Button } from '../../shared/components/ui/Button'
import { formatDownloadError } from '../../shared/utils/downloadErrors'
import { cleanTitleForDisplay } from '../../shared/utils/normalizeTitleKey'
import type { DownloadJob } from '../../shared/types/contracts'
import type { ResolvedCover } from '../covers/useGameCovers'
import { useDownloadClock } from './useDownloadClock'
import { resolveJobVerificationStatus } from '../../shared/utils/jobVerification'

type DownloadsPageProps = {
  jobs: DownloadJob[]
  actionBusyId: string | null
  isTorrentMetadataPhase: (job: DownloadJob) => boolean
  resolveJobProgressPercent: (job: DownloadJob, now?: number) => number
  formatProgressPercent: (job: DownloadJob, now?: number) => string
  onPauseJob: (jobId: string) => Promise<void>
  onResumeJob: (jobId: string) => Promise<void>
  onCancelJob: (jobId: string) => Promise<void>
  onClearCompleted: () => Promise<void>
  onPauseAll: () => Promise<void>
  onOpenJobFolder: (jobId: string) => void
  onPlayJob: (jobId: string) => void
  resolveCover: (title: string, catalogCoverUrl?: string | null) => ResolvedCover
  invalidateLocalCover: (title: string, coverUrl?: string | null) => void
}

const FINISHED_STATUSES = new Set(['completed', 'extracted', 'skipped'])

function queuePrimaryAction(
  job: DownloadJob,
  busyId: string | null,
  t: TFunction,
  onPauseJob: (jobId: string) => Promise<void>,
  onResumeJob: (jobId: string) => Promise<void>,
  onPlayJob: (jobId: string) => void,
) {
  if (job.status === 'extracted') {
    return {
      label: busyId === job.id ? t('downloads.playStarting') : t('common.play'),
      onClick: () => onPlayJob(job.id),
      disabled: busyId === job.id,
    }
  }

  if (job.status === 'paused' || job.status === 'failed') {
    return {
      label: t('common.resume'),
      onClick: () => void onResumeJob(job.id),
    }
  }

  if (['downloading', 'pending', 'retrying', 'seeding'].includes(job.status)) {
    return {
      label: t('common.pause'),
      onClick: () => void onPauseJob(job.id),
    }
  }

  return null
}

function buildJobSections(jobs: DownloadJob[], t: TFunction) {
  const inProgress = jobs.filter((job) => !FINISHED_STATUSES.has(job.status))
  const finished = jobs.filter((job) => FINISHED_STATUSES.has(job.status))
  const sections: { key: string; title: string | null; jobs: DownloadJob[] }[] = []

  if (inProgress.length > 0) {
    sections.push({
      key: 'active',
      title: finished.length > 0 ? t('downloads.inProgress') : null,
      jobs: inProgress,
    })
  }

  if (finished.length > 0) {
    sections.push({
      key: 'done',
      title: inProgress.length > 0 ? t('downloads.completed') : null,
      jobs: finished,
    })
  }

  return sections
}

export function DownloadsPage({
  jobs,
  actionBusyId,
  isTorrentMetadataPhase,
  resolveJobProgressPercent,
  formatProgressPercent,
  onPauseJob,
  onResumeJob,
  onCancelJob,
  onClearCompleted,
  onPauseAll,
  onOpenJobFolder,
  onPlayJob,
  resolveCover,
  invalidateLocalCover,
}: DownloadsPageProps) {
  const { t } = useTranslation()
  const downloadNow = useDownloadClock(jobs)
  const activeJobs = jobs.filter((job) => job.status !== 'cancelled')
  const sections = buildJobSections(activeJobs, t)
  const canPauseAll = activeJobs.some((job) =>
    ['downloading', 'pending', 'retrying', 'seeding'].includes(job.status),
  )
  const canClearCompleted = activeJobs.some((job) => FINISHED_STATUSES.has(job.status))

  const progressWidth = (job: DownloadJob) => {
    const value = resolveJobProgressPercent(job)
    if (value <= 0) return 0
    return Math.max(2, Math.min(100, value))
  }

  const renderJobRow = (job: DownloadJob) => {
    const metadataPhase = isTorrentMetadataPhase(job)
    const cover = resolveCover(job.title)
    const primary = queuePrimaryAction(
      job,
      actionBusyId,
      t,
      onPauseJob,
      onResumeJob,
      onPlayJob,
    )
    const canCancel =
      job.status !== 'cancelled' && !['completed', 'extracted'].includes(job.status)
    const showFolder = job.destPath.trim().length > 0
    const verificationStatus = resolveJobVerificationStatus(job)

    return (
      <li key={job.id} className="download-row">
        <div className="download-row__thumb">
          <CatalogCover
            title={job.title}
            coverUrl={cover.coverUrl}
            localPath={cover.localPath}
            cached={cover.status === 'cached'}
            status={cover.status}
            priority
            onLocalCoverError={() => invalidateLocalCover(job.title, cover.coverUrl)}
          />
        </div>

        <div className="download-row__main">
          <div className="download-row__top">
            <strong className="download-row__title" title={job.title}>
              {cleanTitleForDisplay(job.title)}
            </strong>
            <div className="download-row__top-meta">
              {verificationStatus ? (
                <span
                  className={`download-row__verify-badge download-row__verify-badge--${verificationStatus}`}
                  title={
                    verificationStatus === 'verified'
                      ? t('downloads.verifiedTitle')
                      : t('downloads.verifyFailedTitle')
                  }
                >
                  {verificationStatus === 'verified' ? t('downloads.verified') : t('downloads.verifyFailed')}
                </span>
              ) : null}
              <span className="download-row__percent">{formatProgressPercent(job)}</span>
            </div>
          </div>

          <div
            className={`progress-bar progress-bar--compact${metadataPhase ? ' progress-bar--pulse' : ''}`}
          >
            <div
              className={`progress-fill${metadataPhase ? ' progress-fill--indeterminate' : ''}`}
              style={metadataPhase ? undefined : { width: `${progressWidth(job)}%` }}
            />
          </div>

          <p className="download-row__meta">{downloadRowDetail(job, downloadNow)}</p>
          {job.errorMsg ? (
            <p className="download-row__error">{formatDownloadError(job.errorMsg)}</p>
          ) : null}
        </div>

        <div className="download-row__actions">
          {primary ? (
            <Button
              variant={job.status === 'extracted' ? 'primary' : 'outline'}
              size="compact"
              className="download-row__btn"
              type="button"
              disabled={primary.disabled}
              onClick={primary.onClick}
            >
              {primary.label}
            </Button>
          ) : null}
          {showFolder ? (
            <button
              type="button"
              className="btn btn-outline btn--compact download-row__btn"
              disabled={actionBusyId === job.id}
              onClick={() => onOpenJobFolder(job.id)}
            >
              {t('common.openFolder')}
            </button>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              className="btn btn-outline btn--compact download-row__btn download-row__btn--danger"
              onClick={() => void onCancelJob(job.id)}
            >
              {t('common.cancel')}
            </button>
          ) : null}
        </div>
      </li>
    )
  }

  return (
    <section className="downloads-page">
      {canPauseAll || canClearCompleted ? (
        <div className="downloads-page__actions">
          {canPauseAll ? (
            <button
              className="btn btn-outline btn--compact downloads-toolbar__btn"
              type="button"
              onClick={() => void onPauseAll()}
            >
              {t('downloads.pauseAll')}
            </button>
          ) : null}
          {canClearCompleted ? (
            <button
              className="btn btn-outline btn--compact downloads-toolbar__btn"
              type="button"
              onClick={() => void onClearCompleted()}
            >
              {t('downloads.clearCompleted')}
            </button>
          ) : null}
        </div>
      ) : null}

      {sections.length > 0 ? (
        <div className="downloads-page__sections">
          {sections.map((section) => (
            <section key={section.key} className="downloads-section">
              {section.title ? (
                <h2 className="downloads-section__title">{section.title}</h2>
              ) : null}
              <ul className="download-list download-list--compact">{section.jobs.map(renderJobRow)}</ul>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  )
}
