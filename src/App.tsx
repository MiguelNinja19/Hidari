import { lazy, Suspense, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from './app/hooks'
import { useAppSettings } from './app/context/AppSettingsContext'
import { useNavigation } from './app/context/NavigationContext'
import { useDeepLinkNavigation } from './app/hooks/useDeepLinkNavigation'
import { useCatalogChangeNotifications } from './app/hooks/useCatalogChangeNotifications'
import { useDownloadNotifications } from './app/hooks/useDownloadNotifications'
import { useQueueSync } from './app/hooks/useQueueSync'
import { useKeyboardShortcuts } from './app/hooks/useKeyboardShortcuts'
import { useAppUpdater } from './app/hooks/useAppUpdater'
import { selectActiveDownloadsCount, selectQueueJobs } from './features/queue/queueSelectors'
import { AppShell } from './layout/AppShell'
import { PageCenterSpinner } from './shared/components/PageCenterSpinner'
import type { DiscoverBridge } from './features/discover/DiscoverTab'
import { LibraryTab } from './features/library/LibraryTab'
import './styles/index.css'

const DiscoverTab = lazy(() =>
  import('./features/discover/DiscoverTab').then((m) => ({ default: m.DiscoverTab })),
)
const DownloadsTab = lazy(() =>
  import('./features/downloads/DownloadsTab').then((m) => ({ default: m.DownloadsTab })),
)
const SettingsTab = lazy(() =>
  import('./features/settings/SettingsTab').then((m) => ({ default: m.SettingsTab })),
)

function TabFallback() {
  return <PageCenterSpinner label="A carregar…" />
}

function App() {
  const dispatch = useAppDispatch()
  const jobs = useAppSelector(selectQueueJobs)
  const queueInitialized = useAppSelector((state) => state.queue.initialized)
  const queueLoading = useAppSelector((state) => state.queue.loading)
  const queueError = useAppSelector((state) => state.queue.error)
  const sourcesCount = useAppSelector((state) => state.sources.items.length)
  const activeDownloadsCount = useAppSelector(selectActiveDownloadsCount)
  const { defaultDownloadPath } = useAppSettings()

  const {
    activeTab,
    setActiveTab,
    navigateDiscover,
    navigateDownloads,
  } = useNavigation()

  const discoverBridgeRef = useRef<DiscoverBridge>(null)
  const refreshLibraryScanRef = useRef<((options?: { background?: boolean }) => void) | null>(null)
  const [downloadsBooting, setDownloadsBooting] = useState(false)

  useAppUpdater()
  useKeyboardShortcuts({ activeTab, setActiveTab })
  useDownloadNotifications(jobs)
  useCatalogChangeNotifications(sourcesCount > 0)

  useQueueSync({
    activeTab,
    setDownloadsBooting,
    onJobsReconciled: () => {
      if (activeTab === 'library') {
        refreshLibraryScanRef.current?.({ background: true })
      }
    },
  })

  useDeepLinkNavigation({
    onNavigateDiscover: navigateDiscover,
    applyDiscoverSearch: (query) => {
      discoverBridgeRef.current?.applyDiscoverSearch(query)
    },
    openGameDetail: (input) => {
      discoverBridgeRef.current?.openGameDetail(input)
    },
  })

  const renderMainContent = () => {
    switch (activeTab) {
      case 'discover':
        return (
          <DiscoverTab
            onGoSettings={() => setActiveTab('settings')}
            onGoDownloads={navigateDownloads}
            onRegisterBridge={(bridge) => {
              discoverBridgeRef.current = bridge
            }}
          />
        )
      case 'library':
        return (
          <LibraryTab
            jobs={jobs}
            queueInitialized={queueInitialized}
            defaultDownloadPath={defaultDownloadPath}
            dispatch={dispatch}
            onGoDiscover={navigateDiscover}
            onGoDownloads={navigateDownloads}
            onRegisterRefreshScan={(fn) => {
              refreshLibraryScanRef.current = fn ?? null
            }}
          />
        )
      case 'downloads':
        return (
          <DownloadsTab
            jobs={jobs}
            queueLoading={queueLoading}
            queueError={queueError}
            downloadsBooting={downloadsBooting}
            onGoDiscover={navigateDiscover}
          />
        )
      case 'settings':
        return <SettingsTab />
      default:
        return null
    }
  }

  return (
    <AppShell
      activeTab={activeTab}
      activeDownloadsCount={activeDownloadsCount}
      onTabChange={setActiveTab}
    >
      <Suspense fallback={<TabFallback />}>{renderMainContent()}</Suspense>
    </AppShell>
  )
}

export default App
