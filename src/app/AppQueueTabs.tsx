import { Suspense, lazy } from 'react'
import type { AppDispatch } from './store'
import { CoversProvider } from '../features/covers/CoversProvider'
import { LibraryTab } from '../features/library/LibraryTab'
import { AppTabFallback } from './AppTabFallback'
import type { DownloadJob } from '../shared/types/contracts'
import type { NavTab } from '../layout/types'

const DownloadsTab = lazy(() =>
  import('../features/downloads/DownloadsTab').then((m) => ({ default: m.DownloadsTab })),
)

type AppQueueTabsProps = {
  activeTab: NavTab
  mountedTabs: Record<NavTab, boolean>
  tabClassName: (tab: NavTab) => string
  jobs: DownloadJob[]
  queueCoverCatalog: Array<{
    id: string
    title: string
    genre: string
    coverUrl: string | null
    localCoverPath: string | null
    source: string
  }>
  queueCoverTitles: string[]
  queueInitialized: boolean
  queueError: string | null
  defaultDownloadPath: string
  dispatch: AppDispatch
  navigateDiscover: () => void
  navigateDownloads: () => void
}

export function AppQueueTabs({
  activeTab,
  mountedTabs,
  tabClassName,
  jobs,
  queueCoverCatalog,
  queueCoverTitles,
  queueInitialized,
  queueError,
  defaultDownloadPath,
  dispatch,
  navigateDiscover,
  navigateDownloads,
}: AppQueueTabsProps) {
  return (
    <CoversProvider catalogGames={queueCoverCatalog} jobs={jobs} eager preloadTitles={queueCoverTitles}>
      {mountedTabs.library ? (
        <div className={tabClassName('library')}>
          <LibraryTab
            activeTab={activeTab}
            jobs={jobs}
            queueInitialized={queueInitialized}
            defaultDownloadPath={defaultDownloadPath}
            dispatch={dispatch}
            onGoDiscover={navigateDiscover}
            onGoDownloads={navigateDownloads}
          />
        </div>
      ) : null}
      {mountedTabs.downloads ? (
        <div className={tabClassName('downloads')}>
          <Suspense fallback={<AppTabFallback />}>
            <DownloadsTab jobs={jobs} queueError={queueError} />
          </Suspense>
        </div>
      ) : null}
    </CoversProvider>
  )
}
