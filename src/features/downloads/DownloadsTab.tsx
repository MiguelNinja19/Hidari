import { useCallback, useState } from 'react'
import { useAppDispatch } from '../../app/hooks'
import {
  cancelJob,
  clearCompletedJobs,
  pauseJob,
  resumeJob,
} from '../queue/queueSlice'
import { queueApi } from '../../shared/api/tauri/queueApi'
import { jobNeedsExtraction } from '../../shared/utils/jobExtraction'
import type { ResolvedCover } from '../covers/useGameCovers'
import { DownloadsPage } from './DownloadsPage'
import {
  formatProgressPercent,
  isTorrentMetadataPhase,
  resolveJobProgressPercent,
} from '../../shared/utils/jobProgress'
import { formatUserError } from '../../shared/utils/formatUserError'
import type { DownloadJob } from '../../shared/types/contracts'

type DownloadsTabProps = {
  jobs: DownloadJob[]
  queueLoading: boolean
  queueError: string | null
  downloadsBooting: boolean
  onGoDiscover: () => void
  resolveCover: (title: string, catalogCoverUrl?: string | null) => ResolvedCover
  invalidateLocalCover: (title: string, coverUrl?: string | null) => void
}

export function DownloadsTab({
  jobs,
  queueLoading,
  queueError,
  downloadsBooting,
  onGoDiscover,
  resolveCover,
  invalidateLocalCover,
}: DownloadsTabProps) {
  const dispatch = useAppDispatch()
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const runJobAction = useCallback(async (jobId: string, action: () => Promise<void>) => {
    setActionError('')
    setActionBusyId(jobId)
    try {
      await action()
    } catch (error) {
      setActionError(formatUserError(error, 'Falha na operação.'))
    } finally {
      setActionBusyId(null)
    }
  }, [])

  return (
    <DownloadsPage
      jobs={jobs}
      queueLoading={queueLoading}
      queueError={queueError || actionError || null}
      downloadsBooting={downloadsBooting}
      isTorrentMetadataPhase={isTorrentMetadataPhase}
      resolveJobProgressPercent={resolveJobProgressPercent}
      formatProgressPercent={formatProgressPercent}
      actionBusyId={actionBusyId}
      onPauseJob={async (id) => {
        await dispatch(pauseJob(id))
      }}
      onResumeJob={async (id) => {
        await dispatch(resumeJob(id))
      }}
      onCancelJob={async (id) => {
        await dispatch(cancelJob(id))
      }}
      onClearCompleted={async () => {
        await dispatch(clearCompletedJobs())
      }}
      onPauseAll={async () => {
        jobs
          .filter((job) => job.status !== 'cancelled')
          .forEach((job) => {
            if (['downloading', 'pending', 'retrying'].includes(job.status)) {
              void dispatch(pauseJob(job.id))
            }
          })
      }}
      onOpenJobFolder={(id) => runJobAction(id, () => queueApi.openJobFolder(id))}
      onExtractJob={(id) => runJobAction(id, () => queueApi.extractJob(id))}
      onPlayJob={(id) => runJobAction(id, async () => {
        await queueApi.launchJob(id)
      })}
      jobNeedsExtraction={jobNeedsExtraction}
      onGoDiscover={onGoDiscover}
      resolveCover={resolveCover}
      invalidateLocalCover={invalidateLocalCover}
    />
  )
}
