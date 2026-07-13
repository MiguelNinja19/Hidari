import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch } from '../../app/hooks'
import {
  cancelJob,
  clearCompletedJobs,
  pauseJob,
  removeJobLocally,
  resumeJob,
} from '../queue/queueSlice'
import { queueApi } from '../../shared/api/tauri/queueApi'
import { useToast } from '../../shared/components/ToastProvider'
import { useErrorToast } from '../../shared/hooks/useErrorToast'
import { CoversProvider, useCovers } from '../covers/CoversProvider'
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
  queueError: string | null
}

function DownloadsTabContent({
  jobs,
  queueError,
}: DownloadsTabProps) {
  const dispatch = useAppDispatch()
  const { resolveCover, invalidateLocalCover } = useCovers()
  const { showError } = useToast()
  const { t } = useTranslation()
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)

  useErrorToast(queueError, t('downloads.queueError'))

  const runJobAction = useCallback(async (jobId: string, action: () => Promise<void>) => {
    setActionBusyId(jobId)
    try {
      await action()
    } catch (error) {
      showError(formatUserError(error, t('downloads.operationError')))
    } finally {
      setActionBusyId(null)
    }
  }, [showError, t])

  return (
    <DownloadsPage
      jobs={jobs}
      isTorrentMetadataPhase={isTorrentMetadataPhase}
      resolveJobProgressPercent={resolveJobProgressPercent}
      formatProgressPercent={formatProgressPercent}
      actionBusyId={actionBusyId}
      onPauseJob={async (id) => {
        await runJobAction(id, async () => {
          await dispatch(pauseJob(id)).unwrap()
        })
      }}
      onResumeJob={async (id) => {
        await runJobAction(id, async () => {
          await dispatch(resumeJob(id)).unwrap()
        })
      }}
      onCancelJob={async (id) => {
        await dispatch(cancelJob(id))
      }}
      onRemoveJob={async (id) => {
        await runJobAction(id, async () => {
          await queueApi.removeJobFromLibrary(id)
          dispatch(removeJobLocally(id))
        })
      }}
      onExtractJob={async (id) => {
        await runJobAction(id, async () => {
          await queueApi.extractJob(id)
        })
      }}
      onClearCompleted={async () => {
        await dispatch(clearCompletedJobs())
      }}
      onPauseAll={async () => {
        const active = jobs.filter(
          (job) =>
            job.status !== 'cancelled' &&
            ['downloading', 'pending', 'retrying', 'seeding'].includes(job.status),
        )
        if (active.length === 0) return
        setActionBusyId('__all__')
        try {
          await Promise.all(active.map((job) => dispatch(pauseJob(job.id)).unwrap()))
        } catch (error) {
          showError(formatUserError(error, t('downloads.pauseAllError')))
        } finally {
          setActionBusyId(null)
        }
      }}
      onResumeAll={async () => {
        const paused = jobs.filter(
          (job) => job.status === 'paused' || job.status === 'failed',
        )
        if (paused.length === 0) return
        setActionBusyId('__all__')
        try {
          await Promise.all(paused.map((job) => dispatch(resumeJob(job.id)).unwrap()))
        } catch (error) {
          showError(formatUserError(error, t('downloads.resumeAllError')))
        } finally {
          setActionBusyId(null)
        }
      }}
      onOpenJobFolder={(id) => runJobAction(id, () => queueApi.openJobFolder(id))}
      onPlayJob={(id) =>
        runJobAction(id, async () => {
          await queueApi.launchJob(id)
        })
      }
      resolveCover={resolveCover}
      invalidateLocalCover={invalidateLocalCover}
    />
  )
}

export function DownloadsTab(props: DownloadsTabProps) {
  const catalogGames = useMemo(
    () =>
      props.jobs.map((job) => ({
        id: `job:${job.id}`,
        title: job.title,
        genre: '',
        coverUrl: null,
        localCoverPath: null,
        source: 'queue',
      })),
    [props.jobs],
  )

  const preloadTitles = useMemo(() => props.jobs.map((job) => job.title), [props.jobs])

  return (
    <CoversProvider
      catalogGames={catalogGames}
      jobs={props.jobs}
      eager
      preloadTitles={preloadTitles}
    >
      <DownloadsTabContent {...props} />
    </CoversProvider>
  )
}
