import type { TFunction } from 'i18next'
import { CatalogCover } from '../../shared/components/CatalogCover'
import type { DownloadJob } from '../../shared/types/contracts'
import type { ResolvedCover } from '../covers/useGameCovers'
import { DownloadJobRowActions } from './DownloadJobRowActions'
import { DownloadJobRowContent } from './DownloadJobRowContent'

type DownloadJobRowProps = {
  job: DownloadJob
  t: TFunction
  actionBusyId: string | null
  downloadNow: number
  isTorrentMetadataPhase: (job: DownloadJob) => boolean
  resolveJobProgressPercent: (job: DownloadJob, now?: number) => number
  formatProgressPercent: (job: DownloadJob, now?: number) => string
  onPauseJob: (jobId: string) => Promise<void>
  onResumeJob: (jobId: string) => Promise<void>
  onCancelJob: (jobId: string) => Promise<void>
  onRemoveJob: (jobId: string) => Promise<void>
  onExtractJob: (jobId: string) => Promise<void>
  onOpenJobFolder: (jobId: string) => void
  onGoLibrary: () => void
  resolveCover: (title: string, catalogCoverUrl?: string | null) => ResolvedCover
  invalidateLocalCover: (title: string, coverUrl?: string | null) => void
}

export function DownloadJobRow(props: DownloadJobRowProps) {
  const {
    job,
    t,
    actionBusyId,
    downloadNow,
    isTorrentMetadataPhase,
    resolveJobProgressPercent,
    formatProgressPercent,
    resolveCover,
    invalidateLocalCover,
  } = props
  const metadataPhase = isTorrentMetadataPhase(job)
  const percentLabel = formatProgressPercent(job)
  const hidePercent = !percentLabel
  const cover = resolveCover(job.title)
  const extracting = job.status === 'extracting' || job.extractionStatus === 'extracting'
  const progressWidth = (() => {
    const value = resolveJobProgressPercent(job)
    if (value <= 0) return 0
    return Math.max(2, Math.min(100, value))
  })()

  return (
    <li className="dl-row">
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

      <DownloadJobRowContent
        job={job}
        t={t}
        downloadNow={downloadNow}
        metadataPhase={metadataPhase}
        extracting={extracting}
        percentLabel={percentLabel}
        hidePercent={hidePercent}
        progressWidth={progressWidth}
      />

      <DownloadJobRowActions
        job={job}
        t={t}
        actionBusyId={actionBusyId}
        onPauseJob={props.onPauseJob}
        onResumeJob={props.onResumeJob}
        onCancelJob={props.onCancelJob}
        onRemoveJob={props.onRemoveJob}
        onExtractJob={props.onExtractJob}
        onOpenJobFolder={props.onOpenJobFolder}
        onGoLibrary={props.onGoLibrary}
      />
    </li>
  )
}
