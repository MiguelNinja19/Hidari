import type { TFunction } from 'i18next'
import type { DownloadJob } from '../../shared/types/contracts'
import { jobCanExtract } from '../../shared/utils/jobExtraction'
import { isUiFinishedJob, queuePrimaryAction } from './downloadJobUi'

type DownloadJobRowActionsProps = {
  job: DownloadJob
  t: TFunction
  actionBusyId: string | null
  onPauseJob: (jobId: string) => Promise<void>
  onResumeJob: (jobId: string) => Promise<void>
  onCancelJob: (jobId: string) => Promise<void>
  onRemoveJob: (jobId: string) => Promise<void>
  onExtractJob: (jobId: string) => Promise<void>
  onOpenJobFolder: (jobId: string) => void
  onGoLibrary: () => void
}

function actionButton(
  label: string,
  onClick: () => void,
  className: string,
  disabled: boolean,
) {
  return (
    <button type="button" className={className} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  )
}

export function DownloadJobRowActions(props: DownloadJobRowActionsProps) {
  const { job, t, actionBusyId, onPauseJob, onResumeJob, onCancelJob, onRemoveJob, onExtractJob, onOpenJobFolder, onGoLibrary } = props
  const primary = queuePrimaryAction(job, actionBusyId, t, onPauseJob, onResumeJob, onGoLibrary)
  const busy = actionBusyId === job.id
  const extracting = job.status === 'extracting' || job.extractionStatus === 'extracting'
  const canCancel =
    job.status !== 'cancelled' &&
    job.status !== 'failed' &&
    !isUiFinishedJob(job) &&
    job.status !== 'extracted'

  return (
    <div className="dl-row__actions">
      {primary
        ? actionButton(
            primary.label,
            primary.onClick,
            `set-btn set-btn--compact${primary.primary ? ' set-btn--primary' : ' set-btn--secondary'}`,
            Boolean(primary.disabled || busy),
          )
        : null}
      {jobCanExtract(job)
        ? actionButton(
            extracting || busy ? t('downloads.extracting') : t('common.extract'),
            () => void onExtractJob(job.id),
            'set-btn set-btn--compact set-btn--primary',
            busy || extracting,
          )
        : null}
      {job.destPath.trim()
        ? actionButton(
            t('common.openFolder'),
            () => onOpenJobFolder(job.id),
            'set-btn set-btn--compact set-btn--secondary',
            busy,
          )
        : null}
      {job.status === 'failed'
        ? actionButton(
            t('common.delete'),
            () => void onRemoveJob(job.id),
            'set-btn set-btn--compact set-btn--danger',
            busy,
          )
        : null}
      {canCancel
        ? actionButton(
            t('common.cancel'),
            () => void onCancelJob(job.id),
            'set-btn set-btn--compact set-btn--danger',
            busy,
          )
        : null}
    </div>
  )
}
