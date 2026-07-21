import type { DownloadJob, JobProgressEvent } from '../../shared/types/contracts'
import { applyJobProgressPercent } from './queueJobProgressPercent'
import { mergeJobProgressFields } from './queueJobProgressFields'

export function applyJobProgressEvent(job: DownloadJob, payload: JobProgressEvent) {
  const previousStatus = job.status
  const previousExtraction = job.extractionStatus
  const merged = mergeJobProgressFields(job, payload)
  applyJobProgressPercent(job, payload, merged)

  // Não deixar ticks de seeding/completed apagar extracting/extracted locais.
  const localExtraction = ['extracting', 'extracted'] as const
  if (
    previousExtraction &&
    localExtraction.includes(previousExtraction as (typeof localExtraction)[number]) &&
    ['completed', 'seeding', 'downloading'].includes(job.status)
  ) {
    job.extractionStatus = previousExtraction
    if (previousStatus === 'extracting' || previousStatus === 'extracted') {
      job.status = previousStatus
    }
  }
}
