import { Suspense, lazy, type RefObject } from 'react'
import type { AppDispatch } from './store'
import { DiscoverTab, type DiscoverBridge } from '../features/discover/DiscoverTab'
import { FavoritesTab } from '../features/favorites/FavoritesTab'
import { HomeTab } from '../features/home/HomeTab'
import { AppTabFallback } from './AppTabFallback'
import { AppQueueTabs } from './AppQueueTabs'
import type { DownloadJob } from '../shared/types/contracts'
import type { NavTab } from '../layout/types'

const SettingsTab = lazy(() =>
  import('../features/settings/SettingsTab').then((m) => ({ default: m.SettingsTab })),
)

type AppTabPanelsProps = {
  activeTab: NavTab
  mountedTabs: Record<NavTab, boolean>
  tabClassName: (tab: NavTab) => string
  discoverBridgeRef: RefObject<DiscoverBridge>
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
  setActiveTab: (tab: NavTab) => void
}

export function AppTabPanels(props: AppTabPanelsProps) {
  const { mountedTabs, tabClassName, discoverBridgeRef, navigateDownloads, setActiveTab } = props
  const showQueueCovers = mountedTabs.library || mountedTabs.downloads

  return (
    <>
      {mountedTabs.home ? (
        <div className={tabClassName('home')}>
          <HomeTab
            onNavigateToGame={() => setActiveTab('discover')}
          />
        </div>
      ) : null}
      <div className={tabClassName('discover')}>
        <DiscoverTab
          onGoSettings={() => setActiveTab('settings')}
          onGoDownloads={navigateDownloads}
          onRegisterBridge={(bridge) => {
            discoverBridgeRef.current = bridge
          }}
        />
      </div>
      {mountedTabs.favorites ? (
        <div className={tabClassName('favorites')}>
          <FavoritesTab />
        </div>
      ) : null}
      {showQueueCovers ? <AppQueueTabs {...props} /> : null}
      {mountedTabs.settings ? (
        <div className={tabClassName('settings')}>
          <Suspense fallback={<AppTabFallback />}>
            <SettingsTab />
          </Suspense>
        </div>
      ) : null}
    </>
  )
}
