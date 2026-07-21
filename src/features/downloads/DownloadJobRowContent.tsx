import type { TFunction } from 'i18next'
import { downloadRowDetail } from '../../shared/utils/downloadRowDetail'
import { formatDownloadError } from '../../shared/utils/downloadErrors'
import {
  isAwaitingTorrentContent,
  isInsufficientGameDownload,
} from '../../shared/utils/jobProgress'
import { cleanTitleForDisplay } from '../../shared/utils/normalizeTitleKey'
import type { DownloadJob } from '../../shared/types/contracts'
import { resolveJobVerificationStatus } from '../../shared/utils/jobVerification'

type DownloadJobRowContentProps = {
  job: DownloadJob
  t: TFunction
  downloadNow: number
  metadataPhase: boolean
  extracting: boolean
  percentLabel: string
  hidePercent: boolean
  progressWidth: number
}

export function DownloadJobRowContent({
  job,
  t,
  downloadNow,
  metadataPhase,
  extracting,
  percentLabel,
  hidePercent,
  progressWidth,
}: DownloadJobRowContentProps) {
  const verificationStatus = resolveJobVerificationStatus(job)
  const errorText =
    job.errorMsg &&
    !job.errorMsg.includes('download_stalled_recovering') &&
    !job.errorMsg.includes('download_failover') &&
    !isAwaitingTorrentContent(job) &&
    !isInsufficientGameDownload(job)
      ? formatDownloadError(job.errorMsg).trim()
      : ''

  return (
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
          {!hidePercent ? <span className="dl-row__percent">{percentLabel}</span> : null}
        </div>
      </div>

      <div
        className={`dl-progress${metadataPhase || extracting || hidePercent ? ' dl-progress--pulse' : ''}`}
        role="progressbar"
        aria-valuenow={metadataPhase || extracting || hidePercent ? undefined : progressWidth}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`dl-progress__fill${
            metadataPhase || extracting || hidePercent ? ' dl-progress__fill--indeterminate' : ''
          }`}
          style={
            metadataPhase || extracting || hidePercent
              ? undefined
              : { width: `${progressWidth}%` }
          }
        />
      </div>

      <p className="dl-row__meta">{downloadRowDetail(job, downloadNow)}</p>
      {errorText ? <p className="dl-row__error">{errorText}</p> : null}
    </div>
  )
}
