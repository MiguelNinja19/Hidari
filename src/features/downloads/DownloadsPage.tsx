import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { CatalogCover } from '../../shared/components/CatalogCover'
import { downloadRowDetail } from '../../shared/utils/downloadRowDetail'
import { formatDownloadError } from '../../shared/utils/downloadErrors'
import { jobCanExtract } from '../../shared/utils/jobExtraction'
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
  onRemoveJob: (jobId: string) => Promise<void>
  onExtractJob: (jobId: string) => Promise<void>
  onClearCompleted: () => Promise<void>
  onPauseAll: () => Promise<void>
  onResumeAll: () => Promise<void>
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
      primary: true,
    }
  }

  if (job.status === 'paused' || job.status === 'failed') {
    return {
      label: job.status === 'failed' ? t('common.retry') : t('common.resume'),
      onClick: () => void onResumeJob(job.id),
      primary: false,
    }
  }

  if (['downloading', 'pending', 'retrying', 'seeding'].includes(job.status)) {
    return {
      label: t('common.pause'),
      onClick: () => void onPauseJob(job.id),
      primary: false,
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
  onRemoveJob,
  onExtractJob,
  onClearCompleted,
  onPauseAll,
  onResumeAll,
  onOpenJobFolder,
  onPlayJob,
  resolveCover,
  invalidateLocalCover,
}: DownloadsPageProps) {
  const { t } = useTranslation()
  const downloadNow = useDownloadClock(jobs)
  const activeJobs = jobs.filter((job) => job.status !== 'cancelled')
  const sections = buildJobSections(activeJobs, t)
  const inProgressCount = activeJobs.filter((job) => !FINISHED_STATUSES.has(job.status)).length
  const finishedCount = activeJobs.filter((job) => FINISHED_STATUSES.has(job.status)).length
  const canPauseAll = activeJobs.some((job) =>
    ['downloading', 'pending', 'retrying', 'seeding'].includes(job.status),
  )
  const canResumeAll = activeJobs.some((job) => job.status === 'paused' || job.status === 'failed')
  const canClearCompleted = finishedCount > 0
  const showHeaderActions = canPauseAll || canResumeAll || canClearCompleted

  const summary =
    activeJobs.length === 0
      ? t('downloads.summaryEmpty')
      : inProgressCount > 0 && finishedCount > 0
        ? t('downloads.summaryMixed', { active: inProgressCount, done: finishedCount })
        : inProgressCount > 0
          ? t('downloads.summaryActive', { count: inProgressCount })
          : t('downloads.summaryDone', { count: finishedCount })

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
      job.status !== 'cancelled' &&
      job.status !== 'failed' &&
      !['completed', 'extracted'].includes(job.status)
    const canRemove = job.status === 'failed'
    const canExtract = jobCanExtract(job)
    const extracting =
      job.status === 'extracting' || job.extractionStatus === 'extracting'
    const showFolder = job.destPath.trim().length > 0
    const verificationStatus = resolveJobVerificationStatus(job)
    const busy = actionBusyId === job.id

    return (
      <li key={job.id} className="dl-row">
        <div className="dl-row__thumb">
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

        <div className="dl-row__main">
          <div className="dl-row__top">
            <strong className="dl-row__title" title={job.title}>
              {cleanTitleForDisplay(job.title)}
            </strong>
            <div className="dl-row__top-meta">
              {verificationStatus ? (
                <span
                  className={`dl-row__verify dl-row__verify--${verificationStatus}`}
                  title={
                    verificationStatus === 'verified'
                      ? t('downloads.verifiedTitle')
                      : t('downloads.verifyFailedTitle')
                  }
                >
                  {verificationStatus === 'verified'
                    ? t('downloads.verified')
                    : t('downloads.verifyFailed')}
                </span>
              ) : null}
              <span className="dl-row__percent">{formatProgressPercent(job)}</span>
            </div>
          </div>

          <div
            className={`dl-progress${metadataPhase || extracting ? ' dl-progress--pulse' : ''}`}
            role="progressbar"
            aria-valuenow={metadataPhase || extracting ? undefined : progressWidth(job)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`dl-progress__fill${
                metadataPhase || extracting ? ' dl-progress__fill--indeterminate' : ''
              }`}
              style={metadataPhase || extracting ? undefined : { width: `${progressWidth(job)}%` }}
            />
          </div>

          <p className="dl-row__meta">{downloadRowDetail(job, downloadNow)}</p>
          {job.errorMsg
          && !job.errorMsg.includes('download_stalled_recovering')
          && !job.errorMsg.includes('download_failover') ? (
            <p className="dl-row__error">{formatDownloadError(job.errorMsg)}</p>
          ) : null}
        </div>

        <div className="dl-row__actions">
          {primary ? (
            <button
              type="button"
              className={`set-btn set-btn--compact${primary.primary ? ' set-btn--primary' : ' set-btn--secondary'}`}
              disabled={primary.disabled || busy}
              onClick={primary.onClick}
            >
              {primary.label}
            </button>
          ) : null}
          {canExtract ? (
            <button
              type="button"
              className="set-btn set-btn--compact set-btn--primary"
              disabled={busy || extracting}
              onClick={() => void onExtractJob(job.id)}
            >
              {extracting || busy
                ? t('downloads.extracting')
                : job.extractionStatus === 'failed'
                  ? t('downloads.retryExtract')
                  : t('common.extract')}
            </button>
          ) : null}
          {showFolder ? (
            <button
              type="button"
              className="set-btn set-btn--compact set-btn--secondary"
              disabled={busy}
              onClick={() => onOpenJobFolder(job.id)}
            >
              {t('common.openFolder')}
            </button>
          ) : null}
          {canRemove ? (
            <button
              type="button"
              className="set-btn set-btn--compact set-btn--danger"
              disabled={busy}
              onClick={() => void onRemoveJob(job.id)}
            >
              {t('common.delete')}
            </button>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              className="set-btn set-btn--compact set-btn--danger"
              disabled={busy}
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
    <section className="dl-page">
      <header className="dl-page__head">
        <div className="dl-page__titles">
          <p className="dl-page__label">{t('nav.downloads')}</p>
          <p className="dl-page__desc">{summary}</p>
        </div>
        {showHeaderActions ? (
          <div className="dl-page__actions">
            {canResumeAll ? (
              <button
                type="button"
                className="set-btn set-btn--secondary"
                disabled={actionBusyId === '__all__'}
                onClick={() => void onResumeAll()}
              >
                {t('downloads.resumeAll')}
              </button>
            ) : null}
            {canPauseAll ? (
              <button
                type="button"
                className="set-btn set-btn--secondary"
                disabled={actionBusyId === '__all__'}
                onClick={() => void onPauseAll()}
              >
                {t('downloads.pauseAll')}
              </button>
            ) : null}
            {canClearCompleted ? (
              <button
                type="button"
                className="set-btn set-btn--secondary"
                onClick={() => void onClearCompleted()}
              >
                {t('downloads.clearCompleted')}
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {sections.length > 0 ? (
        <div className="dl-page__sections">
          {sections.map((section) => (
            <section key={section.key} className="dl-section">
              {section.title ? (
                <h2 className="dl-section__title">{section.title}</h2>
              ) : null}
              <ul className="dl-list" role="list">
                {section.jobs.map(renderJobRow)}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  )
}
