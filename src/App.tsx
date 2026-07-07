import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from './app/hooks'
import { useAppBootstrap } from './app/hooks/useAppBootstrap'
import { useDownloadNotifications } from './app/hooks/useDownloadNotifications'
import { useJobPolling } from './app/hooks/useJobPolling'
import { enqueueJob } from './features/queue/queueSlice'
import { sourcesApi } from './shared/api/tauri/sourcesApi'
import { tauriClient } from './shared/api/tauri/client'
import { useGameCovers } from './features/covers/useGameCovers'
import { AppShell } from './layout/AppShell'
import type { NavTab } from './layout/types'
import { DiscoverPage } from './features/discover/DiscoverPage'
import { useDiscoverCatalog } from './features/discover/useDiscoverCatalog'
import { DownloadsTab } from './features/downloads/DownloadsTab'
import { LibraryTab } from './features/library/LibraryTab'
import { SettingsTab } from './features/settings/SettingsTab'
import {
  AFTER_INSTALL_ACTION_DEFAULT,
  INSTALL_ORGANIZATION_DEFAULT,
} from './shared/config/appSettings'
import './App.css'

function App() {
  const dispatch = useAppDispatch()
  const sources = useAppSelector((state) => state.sources.items)
  const sourcesLoading = useAppSelector((state) => state.sources.loading)
  const jobs = useAppSelector((state) => state.queue.jobs)
  const queueLoading = useAppSelector((state) => state.queue.loading)
  const queueError = useAppSelector((state) => state.queue.error)

  const [activeTab, setActiveTab] = useState<NavTab>('discover')
  const [discoverSearch, setDiscoverSearch] = useState('')
  const [defaultDownloadPath, setDefaultDownloadPath] = useState('')
  const [downloadsBooting, setDownloadsBooting] = useState(false)
  const [seedTorrentsEnabled, setSeedTorrentsEnabled] = useState(true)
  const [removeTemporaryFiles, setRemoveTemporaryFiles] = useState(true)
  const [downloadSpeedLimit, setDownloadSpeedLimit] = useState('ilimitado')
  const [installOrganization, setInstallOrganization] = useState(INSTALL_ORGANIZATION_DEFAULT)
  const [afterInstallAction, setAfterInstallAction] = useState(AFTER_INSTALL_ACTION_DEFAULT)
  const [disabledSourceIds, setDisabledSourceIds] = useState<string[]>([])
  const refreshLibraryScanRef = useRef<((options?: { background?: boolean }) => void) | null>(null)

  const activeDownloadsCount = useMemo(
    () =>
      jobs.filter((job) =>
        ['downloading', 'pending', 'retrying', 'extracting', 'seeding'].includes(job.status),
      ).length,
    [jobs],
  )

  const enabledSourcesCount = useMemo(
    () => sources.filter((source) => !disabledSourceIds.includes(source.id)).length,
    [sources, disabledSourceIds],
  )

  const isSourceEnabled = (sourceId: string) => !disabledSourceIds.includes(sourceId)

  useAppBootstrap({
    setDefaultDownloadPath,
    setSeedTorrentsEnabled,
    setInstallOrganization,
    setAfterInstallAction,
    setRemoveTemporaryFiles,
    setDownloadSpeedLimit,
    setDisabledSourceIds,
  })

  const discover = useDiscoverCatalog({
    discoverSearch,
    enabledSourcesCount,
    defaultDownloadPath,
  })

  const {
    resolveCover,
    warmCover,
    refreshCovers,
    syncJobCovers,
    resolveCoversBatch,
    invalidateLocalCover,
  } = useGameCovers(discover.catalogGames)

  useDownloadNotifications(jobs)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void tauriClient.listenDeepLink(() => {
      setActiveTab('discover')
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    if (activeTab !== 'discover' || discover.catalogLoading) return
    const missing = discover.catalogGames
      .filter((game) => !game.coverUrl?.trim() && !game.localCoverPath?.trim())
      .map((game) => game.title)
      .slice(0, 12)
    if (missing.length > 0) {
      resolveCoversBatch(missing)
    }
  }, [activeTab, discover.catalogLoading, discover.catalogGames, resolveCoversBatch])

  useJobPolling({
    activeTab,
    jobs,
    setDownloadsBooting,
    refreshLibraryScan: (options) => refreshLibraryScanRef.current?.(options),
  })

  useEffect(() => {
    syncJobCovers(jobs)
  }, [jobs, syncJobCovers])

  useEffect(() => {
    if (!discover.discoverPickGame?.coverUrl) return
    warmCover(discover.discoverPickGame.title, discover.discoverPickGame.coverUrl)
  }, [discover.discoverPickGame, warmCover])

  const handleEnqueueFromDiscover = async (
    title: string,
    url: string,
    coverUrl?: string | null,
  ) => {
    discover.setDiscoverError('')
    discover.setDiscoverBusy(url)
    try {
      const hasPath = defaultDownloadPath.trim().length > 0
      const fromDb = await sourcesApi.getDefaultDownloadPath()
      if (!hasPath && !fromDb) {
        discover.setDiscoverError('Defina a pasta padrão em Configurações antes de baixar.')
        return
      }
      const destPath = defaultDownloadPath.trim() || fromDb || undefined
      const resolvedCover = coverUrl ?? discover.discoverPickGame?.coverUrl ?? null
      await dispatch(
        enqueueJob({
          title,
          url,
          destPath: destPath ?? undefined,
          coverUrl: resolvedCover ?? undefined,
        }),
      ).unwrap()
      if (resolvedCover) refreshCovers()
      discover.closeDiscoverPicker()
      setActiveTab('downloads')
    } catch (error) {
      discover.setDiscoverError(
        error instanceof Error ? error.message : 'Falha ao adicionar o download à fila.',
      )
    } finally {
      discover.setDiscoverBusy(null)
    }
  }

  const renderMainContent = () => {
    switch (activeTab) {
      case 'discover':
        return (
          <DiscoverPage
            discoverSearch={discoverSearch}
            catalogLoading={discover.catalogLoading}
            catalogLoadingMore={discover.catalogLoadingMore}
            catalogHasMore={discover.catalogHasMore}
            loadMoreCatalog={discover.loadMoreCatalog}
            discoverError={discover.discoverError}
            catalogError={discover.catalogError}
            displayCatalogSource={discover.displayCatalogSource}
            discoverPickGame={discover.discoverPickGame}
            discoverPickLoading={discover.discoverPickLoading}
            discoverPickError={discover.discoverPickError}
            discoverPickOptions={discover.discoverPickOptions}
            discoverBusy={discover.discoverBusy}
            enabledSourcesCount={enabledSourcesCount}
            sources={sources}
            sourcesLoading={sourcesLoading}
            isSourceEnabled={isSourceEnabled}
            setDiscoverSearch={setDiscoverSearch}
            onGoSettings={() => setActiveTab('settings')}
            openDiscoverPicker={discover.openDiscoverPicker}
            closeDiscoverPicker={discover.closeDiscoverPicker}
            handleEnqueueFromDiscover={handleEnqueueFromDiscover}
            resolveCover={resolveCover}
            warmCover={warmCover}
            invalidateLocalCover={invalidateLocalCover}
          />
        )
      case 'library':
        return (
          <LibraryTab
            jobs={jobs}
            defaultDownloadPath={defaultDownloadPath}
            dispatch={dispatch}
            onGoDiscover={() => setActiveTab('discover')}
            onGoDownloads={() => setActiveTab('downloads')}
            onRegisterRefreshScan={(fn) => {
              refreshLibraryScanRef.current = fn
            }}
            resolveCover={resolveCover}
            resolveCoversBatch={resolveCoversBatch}
            invalidateLocalCover={invalidateLocalCover}
          />
        )
      case 'downloads':
        return (
          <DownloadsTab
            jobs={jobs}
            queueLoading={queueLoading}
            queueError={queueError}
            downloadsBooting={downloadsBooting}
            onGoDiscover={() => setActiveTab('discover')}
            resolveCover={resolveCover}
            invalidateLocalCover={invalidateLocalCover}
          />
        )
      case 'settings':
        return (
          <SettingsTab
            defaultDownloadPath={defaultDownloadPath}
            setDefaultDownloadPath={setDefaultDownloadPath}
            installOrganization={installOrganization}
            setInstallOrganization={setInstallOrganization}
            afterInstallAction={afterInstallAction}
            setAfterInstallAction={setAfterInstallAction}
            removeTemporaryFiles={removeTemporaryFiles}
            setRemoveTemporaryFiles={setRemoveTemporaryFiles}
            seedTorrentsEnabled={seedTorrentsEnabled}
            setSeedTorrentsEnabled={setSeedTorrentsEnabled}
            downloadSpeedLimit={downloadSpeedLimit}
            setDownloadSpeedLimit={setDownloadSpeedLimit}
            disabledSourceIds={disabledSourceIds}
            setDisabledSourceIds={setDisabledSourceIds}
            onRefreshCovers={refreshCovers}
          />
        )
      default:
        return null
    }
  }

  return (
    <AppShell activeTab={activeTab} activeDownloadsCount={activeDownloadsCount} onTabChange={setActiveTab}>
      {renderMainContent()}
    </AppShell>
  )
}

export default App
