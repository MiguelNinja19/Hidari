import type { DownloadJob } from '../types/contracts'

export type JobVerificationStatus = 'verified' | 'verify_failed'

export function resolveJobVerificationStatus(
  job: DownloadJob,
): JobVerificationStatus | null {
  const extractionStatus = job.extractionStatus?.trim()
  if (extractionStatus === 'verified' || extractionStatus === 'verify_failed') {
    return extractionStatus
  }
  if (job.status === 'verify_failed') return 'verify_failed'
  if (job.status === 'verified') return 'verified'
  return null
}
