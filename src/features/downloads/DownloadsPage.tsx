import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../shared/components/EmptyState'
import type { DownloadJob } from '../../shared/types/contracts'
import type { ResolvedCover } from '../covers/useGameCovers'
import { useDownloadClock } from './useDownloadClock'
import { buildJobSections, isSeedingJob, isUiFinishedJob } from './downloadJobUi'
import { DownloadJobRow } from './DownloadJobRow'
import { DownloadsPageHeader } from './DownloadsPageHeader'

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
  onGoLibrary: () => void
  onGoDiscover: () => void
  resolveCover: (title: string, catalogCoverUrl?: string | null) => ResolvedCover
  invalidateLocalCover: (title: string, coverUrl?: string | null) => void
}

export function DownloadsPage(props: DownloadsPageProps) {
  const { t } = useTranslation()
  const { jobs, actionBusyId, onClearCompleted, onPauseAll, onResumeAll, onGoDiscover } = props
  const downloadNow = useDownloadClock(jobs)
  const activeJobs = jobs
  const sections = buildJobSections(activeJobs, t)
  const isEmpty = activeJobs.length === 0
  const inProgressCount = activeJobs.filter((job) => !isUiFinishedJob(job)).length
  const finishedCount = activeJobs.filter(
    (job) => isUiFinishedJob(job) && !isSeedingJob(job),
  ).length
  const seedingCount = activeJobs.filter((job) => isSeedingJob(job)).length
  const canPauseAll = activeJobs.some(
    (job) => ['downloading', 'pending', 'retrying'].includes(job.status) && !isUiFinishedJob(job),
  )
  const canResumeAll = activeJobs.some((job) => job.status === 'paused' || job.status === 'failed')
  const summary =
    activeJobs.length === 0
      ? t('downloads.summaryEmpty')
      : inProgressCount > 0 && finishedCount > 0
        ? t('downloads.summaryMixed', { active: inProgressCount, done: finishedCount })
        : inProgressCount > 0
          ? t('downloads.summaryActive', { count: inProgressCount })
          : seedingCount > 0 && finishedCount === 0
            ? t('downloads.summarySeeding', {
                count: seedingCount,
                defaultValue: `${seedingCount} semeando`,
              })
            : t('downloads.summaryDone', { count: finishedCount })

  return (
    <section className="dl-page">
      <DownloadsPageHeader
        summary={summary}
        showHeaderActions={canPauseAll || canResumeAll || finishedCount > 0}
        canResumeAll={canResumeAll}
        canPauseAll={canPauseAll}
        canClearCompleted={finishedCount > 0}
        actionBusyId={actionBusyId}
        onResumeAll={onResumeAll}
        onPauseAll={onPauseAll}
        onClearCompleted={onClearCompleted}
      />
      {isEmpty ? (
        <EmptyState
          title={t('downloads.emptyTitle')}
          action={{
            label: t('downloads.emptyAction'),
            onClick: onGoDiscover,
          }}
        />
      ) : null}
      {sections.length > 0 ? (
        <div className="dl-page__sections">
          {sections.map((section) => (
            <section key={section.key} className="dl-section">
              {section.title ? <h2 className="dl-section__title">{section.title}</h2> : null}
              <ul className="dl-list" role="list">
                {section.jobs.map((job) => (
                  <DownloadJobRow key={job.id} job={job} t={t} downloadNow={downloadNow} {...props} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  )
}
