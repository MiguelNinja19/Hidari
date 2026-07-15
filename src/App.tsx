import { Suspense, lazy, useCallback, useEffect, useMemo, useState, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from './app/hooks'
import { useAppSettings } from './app/context/AppSettingsContext'
import { useNavigation } from './app/context/NavigationContext'
import { useDeepLinkNavigation } from './app/hooks/useDeepLinkNavigation'
import { useCatalogChangeNotifications } from './app/hooks/useCatalogChangeNotifications'
import { useDownloadNotifications } from './app/hooks/useDownloadNotifications'
import { useNotificationNavigation } from './app/hooks/useNotificationNavigation'
import { useQueueSync } from './app/hooks/useQueueSync'
import { useKeyboardShortcuts } from './app/hooks/useKeyboardShortcuts'
import { useAppUpdater } from './app/hooks/useAppUpdater'
import {
  selectActiveDownloadsCount,
  selectQueueJobs,
} from './features/queue/queueSelectors'
import { AppShell } from './layout/AppShell'
import { PageCenterSpinner } from './shared/components/PageCenterSpinner'
import { UpdateBanner } from './shared/components/UpdateBanner'
import { useToast } from './shared/components/ToastProvider'
import { CoversProvider } from './features/covers/CoversProvider'
import type { DiscoverBridge } from './features/discover/DiscoverTab'
import { DiscoverTab } from './features/discover/DiscoverTab'
import { FavoritesTab } from './features/favorites/FavoritesTab'
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
  const { t } = useTranslation()
  return <PageCenterSpinner label={t('common.loadingTab')} />
}

function App() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const jobs = useAppSelector(selectQueueJobs)
  const queueInitialized = useAppSelector((state) => state.queue.initialized)
  const queueError = useAppSelector((state) => state.queue.error)
  const sourcesCount = useAppSelector((state) => state.sources.items.length)
  const activeDownloadsCount = useAppSelector(selectActiveDownloadsCount)
  const { defaultDownloadPath } = useAppSettings()
  const { showSuccess } = useToast()

  const {
    activeTab,
    setActiveTab,
    navigateDiscover,
    navigateDownloads,
  } = useNavigation()

  const discoverBridgeRef = useRef<DiscoverBridge>(null)
  const [, setDownloadsBooting] = useState(false)

  // Mantém tabs já visitadas montadas (trocar de aba não perde cache / capas).
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

  const onReadyToInstall = useCallback(
    (gameTitle: string) => {
      showSuccess(`${t('downloads.notifyReadyToInstall')} · ${gameTitle}`)
    },
    [showSuccess, t],
  )
  const onReadyToPlay = useCallback(
    (gameTitle: string) => {
      showSuccess(`${t('downloads.notifyReadyToPlay')} · ${gameTitle}`)
    },
    [showSuccess, t],
  )

  const updater = useAppUpdater()
  useKeyboardShortcuts({ activeTab, setActiveTab })
  useDownloadNotifications(jobs, { onReadyToInstall, onReadyToPlay })
  useCatalogChangeNotifications(sourcesCount > 0)
  useNotificationNavigation({ onNavigate: setActiveTab })

  useQueueSync({
    activeTab,
    setDownloadsBooting,
    // Não re-escanear a biblioteca a cada poll da fila — isso congelava a UI.
    // Pastas novas: watch de pasta. Job terminado: inspect do path desse job.
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

  const queueJobsCoverKey = jobs.map((job) => `${job.id}\0${job.title}`).join('|')
  const queueCoverCatalog = useMemo(
    () =>
      jobs.map((job) => ({
        id: `job:${job.id}`,
        title: job.title,
        genre: '',
        coverUrl: null as string | null,
        localCoverPath: null as string | null,
        source: 'queue',
      })),
    // Só IDs/títulos — progresso da fila não pode invalidar o catálogo de capas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queueJobsCoverKey],
  )
  const queueCoverTitles = useMemo(
    () => jobs.map((job) => job.title),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queueJobsCoverKey],
  )
  const showQueueCovers = mountedTabs.library || mountedTabs.downloads

  return (
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

      {showQueueCovers ? (
        <CoversProvider
          catalogGames={queueCoverCatalog}
          jobs={jobs}
          eager
          preloadTitles={queueCoverTitles}
        >
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
              <Suspense fallback={<TabFallback />}>
                <DownloadsTab jobs={jobs} queueError={queueError} />
              </Suspense>
            </div>
          ) : null}
        </CoversProvider>
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
