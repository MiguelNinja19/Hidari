import { useRef, useState, type CSSProperties } from 'react'
import { useAppDispatch, useAppSelector } from './app/hooks'
import { useAppSettings } from './app/context/AppSettingsContext'
import { useNavigation } from './app/context/NavigationContext'
import { useAppMountedTabs, useAppQueueCoverCatalog } from './app/hooks/useAppTabPanels'
import { useAppLifecycle } from './app/hooks/useAppLifecycle'
import { AppTabPanels } from './app/AppTabPanels'
import { selectActiveDownloadsCount, selectQueueJobs } from './features/queue/queueSelectors'
import { AppShell } from './layout/AppShell'
import { UpdateBanner } from './shared/components/UpdateBanner'
import { useToast } from './shared/components/ToastProvider'
import { FavoriteCatalogProvider } from './features/favorites/FavoriteCatalogProvider'
import type { DiscoverBridge } from './features/discover/DiscoverTab'
import type { NavTab } from './layout/types'
import './styles/index.css'

function App() {
  const dispatch = useAppDispatch()
  const jobs = useAppSelector(selectQueueJobs)
  const queueInitialized = useAppSelector((state) => state.queue.initialized)
  const queueError = useAppSelector((state) => state.queue.error)
  const sourcesCount = useAppSelector((state) => state.sources.items.length)
  const activeDownloadsCount = useAppSelector(selectActiveDownloadsCount)
  const { defaultDownloadPath } = useAppSettings()
  const { showSuccess, showError } = useToast()
  const { activeTab, setActiveTab, navigateDiscover, navigateDownloads } = useNavigation()
  const discoverBridgeRef = useRef<DiscoverBridge>(null)
  const [, setDownloadsBooting] = useState(false)
  const mountedTabs = useAppMountedTabs(activeTab)
  const { queueCoverCatalog, queueCoverTitles } = useAppQueueCoverCatalog(jobs)
  const updater = useAppLifecycle({
    jobs,
    sourcesCount,
    activeTab,
    setActiveTab,
    setDownloadsBooting,
    discoverBridgeRef,
    navigateDiscover,
    showSuccess,
    showError,
  })

  const tabStyle = (tab: NavTab): CSSProperties | undefined =>
    activeTab === tab ? undefined : { display: 'none' }

  return (
    <FavoriteCatalogProvider>
      <AppShell
        activeTab={activeTab}
        activeDownloadsCount={activeDownloadsCount}
        onTabChange={setActiveTab}
        banner={
          updater.updateAvailable && !updater.dismissed ? (
            <UpdateBanner
              version={updater.version}
              installing={updater.installing}
              onInstall={() => void updater.installUpdate()}
              onDismiss={updater.dismiss}
            />
          ) : null
        }
      >
        <AppTabPanels
          activeTab={activeTab}
          mountedTabs={mountedTabs}
          tabStyle={tabStyle}
          discoverBridgeRef={discoverBridgeRef}
          jobs={jobs}
          queueCoverCatalog={queueCoverCatalog}
          queueCoverTitles={queueCoverTitles}
          queueInitialized={queueInitialized}
          queueError={queueError}
          defaultDownloadPath={defaultDownloadPath}
          dispatch={dispatch}
          navigateDiscover={navigateDiscover}
          navigateDownloads={navigateDownloads}
          setActiveTab={setActiveTab}
        />
      </AppShell>
    </FavoriteCatalogProvider>
  )
}

export default App
