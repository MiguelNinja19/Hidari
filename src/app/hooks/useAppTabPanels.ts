import { useEffect, useState } from 'react'
import type { NavTab } from '../../layout/types'

export function useAppMountedTabs(activeTab: NavTab) {
  const [mountedTabs, setMountedTabs] = useState<Record<NavTab, boolean>>({
    discover: true,
    favorites: false,
    library: false,
    downloads: false,
    settings: false,
  })

  useEffect(() => {
    setMountedTabs((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }))
  }, [activeTab])

  return mountedTabs
}

export function useAppQueueCoverCatalog(jobs: Array<{ id: string; title: string }>) {
  const queueJobsCoverKey = jobs.map((job) => `${job.id}\0${job.title}`).join('|')
  const queueCoverCatalog = jobs.map((job) => ({
    id: `job:${job.id}`,
    title: job.title,
    genre: '',
    coverUrl: null as string | null,
    localCoverPath: null as string | null,
    source: 'queue',
  }))
  const queueCoverTitles = jobs.map((job) => job.title)
  return { queueJobsCoverKey, queueCoverCatalog, queueCoverTitles }
}
