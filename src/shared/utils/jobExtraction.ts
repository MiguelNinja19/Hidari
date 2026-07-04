import type { DownloadJob } from '../types/contracts'
import { resolveDeletePath } from './archive'

/** Job finished downloading but archive still needs extraction. */
export function jobNeedsExtraction(job: DownloadJob): boolean {
  if (['extracting', 'extracted', 'cancelled'].includes(job.status)) {
    return false
  }
  if (job.status === 'completed' || job.status === 'seeding' || job.status === 'failed') {
    return true
  }
  if (
    job.progress >= 99 &&
    ['downloading', 'retrying', 'pending', 'seeding'].includes(job.status)
  ) {
    return true
  }
  return false
}

export function jobPathsOverlap(a: string, b: string): boolean {
  const left = resolveDeletePath(a).toLowerCase()
  const right = resolveDeletePath(b).toLowerCase()
  if (!left || !right) return false
  return left === right || left.startsWith(`${right}\\`) || right.startsWith(`${left}\\`)
}
