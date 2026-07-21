import { Suspense, lazy, type CSSProperties, type RefObject } from 'react'
import type { AppDispatch } from './store'
import { DiscoverTab, type DiscoverBridge } from '../features/discover/DiscoverTab'
import { FavoritesTab } from '../features/favorites/FavoritesTab'
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
  tabStyle: (tab: NavTab) => CSSProperties | undefined
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
  const { mountedTabs, tabStyle, discoverBridgeRef, navigateDownloads, setActiveTab } = props
  const showQueueCovers = mountedTabs.library || mountedTabs.downloads

  return (
    <>
      <div style={tabStyle('discover')}>
        <DiscoverTab
          onGoSettings={() => setActiveTab('settings')}
          onGoDownloads={navigateDownloads}
          onRegisterBridge={(bridge) => {
            discoverBridgeRef.current = bridge
          }}
        />
      </div>
      {mountedTabs.favorites ? (
        <div style={tabStyle('favorites')}>
          <FavoritesTab />
        </div>
      ) : null}
      {showQueueCovers ? <AppQueueTabs {...props} /> : null}
      {mountedTabs.settings ? (
        <div style={tabStyle('settings')}>
          <Suspense fallback={<AppTabFallback />}>
            <SettingsTab />
          </Suspense>
        </div>
      ) : null}
    </>
  )
}
