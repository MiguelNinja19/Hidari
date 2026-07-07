import { useEffect, useState } from 'react'
import type { DownloadJob } from '../../shared/types/contracts'
import { isTorrentMetadataPhase } from '../../shared/utils/jobProgress'

/** Relógio local só para a tab Downloads (metadata torrent). */
export function useDownloadClock(jobs: DownloadJob[]) {
  const [downloadNow, setDownloadNow] = useState(() => Date.now())

  const metadataJobSignature = jobs
    .filter((job) => isTorrentMetadataPhase(job))
    .map((job) => job.id)
    .join('|')

  useEffect(() => {
    if (!metadataJobSignature) return
    const timer = window.setInterval(() => setDownloadNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [metadataJobSignature])

  return downloadNow
}
