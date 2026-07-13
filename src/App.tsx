import { Suspense, lazy, useEffect, useState, useRef, type CSSProperties } from 'react'
import { useAppDispatch, useAppSelector } from './app/hooks'
import { useAppSettings } from './app/context/AppSettingsContext'
import { useNavigation } from './app/context/NavigationContext'
import { useDeepLinkNavigation } from './app/hooks/useDeepLinkNavigation'
import { useCatalogChangeNotifications } from './app/hooks/useCatalogChangeNotifications'
import { useDownloadNotifications } from './app/hooks/useDownloadNotifications'
import { useQueueSync } from './app/hooks/useQueueSync'
import { useKeyboardShortcuts } from './app/hooks/useKeyboardShortcuts'
import { useAppUpdater } from './app/hooks/useAppUpdater'
import {
  selectActiveDownloadSpeedBps,
  selectActiveDownloadsCount,
  selectQueueJobs,
} from './features/queue/queueSelectors'
import { AppShell } from './layout/AppShell'
import { PageCenterSpinner } from './shared/components/PageCenterSpinner'
import type { DiscoverBridge } from './features/discover/DiscoverTab'
import { DiscoverTab } from './features/discover/DiscoverTab'
import { LibraryTab } from './features/library/LibraryTab'
import type { NavTab } from './layout/types'
import './styles/index.css'

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
  const queueError = useAppSelector((state) => state.queue.error)
  const sourcesCount = useAppSelector((state) => state.sources.items.length)
  const activeDownloadsCount = useAppSelector(selectActiveDownloadsCount)
  const activeDownloadSpeedBps = useAppSelector(selectActiveDownloadSpeedBps)
  const { defaultDownloadPath } = useAppSettings()

  const {
    activeTab,
    setActiveTab,
    navigateDiscover,
    navigateDownloads,
  } = useNavigation()

  const discoverBridgeRef = useRef<DiscoverBridge>(null)
  const refreshLibraryScanRef = useRef<((options?: { background?: boolean }) => void) | null>(null)
  const [, setDownloadsBooting] = useState(false)

  // Mantém tabs já visitadas montadas (trocar de aba não perde cache / capas).
  const [mountedTabs, setMountedTabs] = useState<Record<NavTab, boolean>>({
    discover: true,
    library: false,
    downloads: false,
    settings: false,
  })

  useEffect(() => {
    setMountedTabs((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }))
  }, [activeTab])

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

  const tabStyle = (tab: NavTab): CSSProperties | undefined =>
    activeTab === tab ? undefined : { display: 'none' }

  return (
    <AppShell
      activeTab={activeTab}
      activeDownloadsCount={activeDownloadsCount}
      activeDownloadSpeedBps={activeDownloadSpeedBps}
      onTabChange={setActiveTab}
    >
      <div style={tabStyle('discover')}>
        <DiscoverTab
          onGoSettings={() => setActiveTab('settings')}
          onGoDownloads={navigateDownloads}
          onRegisterBridge={(bridge) => {
            discoverBridgeRef.current = bridge
          }}
        />
      </div>

      {mountedTabs.library ? (
        <div style={tabStyle('library')}>
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
        </div>
      ) : null}

      {mountedTabs.downloads ? (
        <div style={tabStyle('downloads')}>
          <Suspense fallback={<TabFallback />}>
            <DownloadsTab jobs={jobs} queueError={queueError} />
          </Suspense>
        </div>
      ) : null}

      {mountedTabs.settings ? (
        <div style={tabStyle('settings')}>
          <Suspense fallback={<TabFallback />}>
            <SettingsTab />
          </Suspense>
        </div>
      ) : null}
    </AppShell>
  )
}

export default App
