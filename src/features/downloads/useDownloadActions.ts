import { useCallback, useState } from 'react'
import type { TFunction } from 'i18next'
import type { AppDispatch } from '../../app/store'
import type { DownloadJob } from '../../shared/types/contracts'
import { queueApi } from '../../shared/api/tauri/queueApi'
import {
  formatPasswordExtractionError,
  isArchivePasswordRequiredError,
} from '../../shared/config/extractionErrorMessages'
import { formatUserError } from '../../shared/utils/formatUserError'
import {
  cancelJob,
  clearCompletedJobs,
  pauseJob,
  removeJobLocally,
  resumeJob,
} from '../queue/queueSlice'

function formatQueueActionError(
  error: unknown,
  job: DownloadJob | undefined,
  fallback: string,
): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  if (isArchivePasswordRequiredError(raw)) {
    const { text, hint } = formatPasswordExtractionError(raw, job?.title, job?.sourceName)
    return hint ? `${text} ${hint.url}` : text
  }
  return formatUserError(error, fallback)
}

export function useDownloadActions(
  jobs: DownloadJob[],
  dispatch: AppDispatch,
  showError: (message: string) => void,
  t: TFunction,
) {
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const run = useCallback(async (id: string, action: () => Promise<unknown>) => {
    setActionBusyId(id)
    try {
      await action()
    } catch (error) {
      const job = jobs.find((item) => item.id === id)
      const message = formatQueueActionError(error, job, t('downloads.operationError'))
      if (message.trim()) showError(message)
    } finally {
      setActionBusyId(null)
    }
  }, [jobs, showError, t])
  const runAll = async (ids: string[], action: (id: string) => Promise<unknown>, errorKey: string) => {
    if (ids.length === 0) return
    setActionBusyId('__all__')
    try {
      await Promise.all(ids.map(action))
    } catch (error) {
      showError(formatUserError(error, t(errorKey)))
    } finally {
      setActionBusyId(null)
    }
  }

  return {
    actionBusyId,
    onPauseJob: (id: string) => run(id, () => dispatch(pauseJob(id)).unwrap()),
    onResumeJob: (id: string) => run(id, () => dispatch(resumeJob(id)).unwrap()),
    onCancelJob: async (id: string) => { await dispatch(cancelJob(id)) },
    onRemoveJob: (id: string) => run(id, async () => {
      await queueApi.removeJobFromLibrary(id)
      dispatch(removeJobLocally(id))
    }),
    onExtractJob: (id: string) => run(id, () => queueApi.extractJob(id)),
    onClearCompleted: async () => { await dispatch(clearCompletedJobs()) },
    onPauseAll: () => runAll(
      jobs.filter((job) =>
        job.status !== 'cancelled' &&
        ['downloading', 'pending', 'retrying', 'seeding'].includes(job.status)
      ).map((job) => job.id),
      (id) => dispatch(pauseJob(id)).unwrap(),
      'downloads.pauseAllError',
    ),
    onResumeAll: () => runAll(
      jobs.filter((job) => ['paused', 'failed'].includes(job.status)).map((job) => job.id),
      (id) => dispatch(resumeJob(id)).unwrap(),
      'downloads.resumeAllError',
    ),
    onOpenJobFolder: (id: string) => run(id, () => queueApi.openJobFolder(id)),
  }
}
