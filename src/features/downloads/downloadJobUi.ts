import type { TFunction } from 'i18next'
import type { DownloadJob } from '../../shared/types/contracts'
import {
  isDownloadFullyTransferred,
  isInsufficientGameDownload,
} from '../../shared/utils/jobProgress'
import { jobBelongsInLibrary } from '../library/libraryItemState'

/** Transferência concluída na UI (inclui seeding e 100% ainda marcado como downloading). */
export function isUiFinishedJob(job: DownloadJob): boolean {
  if (isInsufficientGameDownload(job)) return false
  const total = Number(job.totalBytes) || 0
  const done = Number(job.bytesDownloaded) || 0
  if (total >= 5 * 1024 * 1024 && done < total * 0.995) return false
  if (['completed', 'extracted', 'skipped', 'seeding', 'cancelled', 'failed'].includes(job.status)) {
    return true
  }
  if (
    isDownloadFullyTransferred(job) &&
    ['downloading', 'pending', 'retrying', 'paused'].includes(job.status)
  ) {
    return true
  }
  return false
}

export function isSeedingJob(job: DownloadJob): boolean {
  return job.status === 'seeding' && !isInsufficientGameDownload(job)
}

export function buildJobSections(jobs: DownloadJob[], t: TFunction) {
  const seeding = jobs.filter((job) => isSeedingJob(job))
  const inProgress = jobs.filter((job) => !isUiFinishedJob(job))
  const finished = jobs.filter(
    (job) => isUiFinishedJob(job) && !isSeedingJob(job),
  )
  const sections: { key: string; title: string | null; jobs: DownloadJob[] }[] = []

  if (inProgress.length > 0) {
    sections.push({
      key: 'active',
      title:
        finished.length > 0 || seeding.length > 0 ? t('downloads.inProgress') : null,
      jobs: inProgress,
    })
  }

  if (seeding.length > 0) {
    sections.push({
      key: 'seeding',
      title: t('downloads.seeding', { defaultValue: 'Semeando' }),
      jobs: seeding,
    })
  }

  if (finished.length > 0) {
    sections.push({
      key: 'done',
      title:
        inProgress.length > 0 || seeding.length > 0 ? t('downloads.completed') : null,
      jobs: finished,
    })
  }

  return sections
}

export function queuePrimaryAction(
  job: DownloadJob,
  busyId: string | null,
  t: TFunction,
  onPauseJob: (jobId: string) => Promise<void>,
  onResumeJob: (jobId: string) => Promise<void>,
  onGoLibrary: () => void,
) {
  if (job.status === 'cancelled') {
    return null
  }

  if (job.status === 'paused' || job.status === 'failed') {
    return {
      label: job.status === 'failed' ? t('common.retry') : t('common.resume'),
      onClick: () => void onResumeJob(job.id),
      primary: false,
    }
  }

  // Só CTA para biblioteca quando o job realmente pertence lá — não cancelled/failed genérico.
  if (jobBelongsInLibrary(job) || job.status === 'seeding') {
    return {
      label: t('nav.library', { defaultValue: 'Biblioteca' }),
      onClick: () => onGoLibrary(),
      disabled: busyId === job.id,
      primary: true,
    }
  }

  if (
    ['downloading', 'pending', 'retrying'].includes(job.status) ||
    (isInsufficientGameDownload(job) && !['paused', 'failed', 'cancelled'].includes(job.status))
  ) {
    return {
      label: t('common.pause'),
      onClick: () => void onPauseJob(job.id),
      primary: false,
    }
  }

  return null
}
