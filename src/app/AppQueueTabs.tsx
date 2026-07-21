import { Suspense, lazy, type CSSProperties } from 'react'
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
  tabStyle: (tab: NavTab) => CSSProperties | undefined
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
  tabStyle,
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
        <div style={tabStyle('library')}>
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
        <div style={tabStyle('downloads')}>
          <Suspense fallback={<AppTabFallback />}>
            <DownloadsTab jobs={jobs} queueError={queueError} />
          </Suspense>
        </div>
      ) : null}
    </CoversProvider>
  )
}
