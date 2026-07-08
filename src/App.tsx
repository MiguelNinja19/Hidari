import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from './app/hooks'
import { useAppSettings } from './app/context/AppSettingsContext'
import { useNavigation } from './app/context/NavigationContext'
import { useDeepLinkNavigation } from './app/hooks/useDeepLinkNavigation'
import { useCatalogChangeNotifications } from './app/hooks/useCatalogChangeNotifications'
import { useDownloadNotifications } from './app/hooks/useDownloadNotifications'
import { useJobPolling } from './app/hooks/useJobPolling'
import { useKeyboardShortcuts } from './app/hooks/useKeyboardShortcuts'
import { useAppUpdater } from './app/hooks/useAppUpdater'
import { enqueueJob } from './features/queue/queueSlice'
import { sourcesApi } from './shared/api/tauri/sourcesApi'
import { useGameCovers } from './features/covers/useGameCovers'
import { AppShell } from './layout/AppShell'
import { DiscoverPage } from './features/discover/DiscoverPage'
import { useDiscoverCatalog } from './features/discover/useDiscoverCatalog'
import { useFavorites } from './features/favorites/useFavorites'
import { FavoritesPage } from './features/favorites/FavoritesPage'
import { DownloadsTab } from './features/downloads/DownloadsTab'
import { LibraryTab } from './features/library/LibraryTab'
import { SettingsTab } from './features/settings/SettingsTab'
import { catalogGameGroupKey } from './shared/utils/normalizeTitleKey'
import { formatUserError } from './shared/utils/formatUserError'
import type { FavoriteEntry } from './shared/types/contracts'
import './styles/index.css'

function App() {
  const dispatch = useAppDispatch()
  const sources = useAppSelector((state) => state.sources.items)
  const sourcesLoading = useAppSelector((state) => state.sources.loading)
  const jobs = useAppSelector((state) => state.queue.jobs)
  const queueLoading = useAppSelector((state) => state.queue.loading)
  const queueError = useAppSelector((state) => state.queue.error)

  const {
    activeTab,
    setActiveTab,
    navigateDiscover,
    navigateDownloads,
  } = useNavigation()

  const {
    defaultDownloadPath,
    disabledSourceIds,
  } = useAppSettings()

  const [discoverSearch, setDiscoverSearch] = useState('')
  const [downloadsBooting, setDownloadsBooting] = useState(false)
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const refreshLibraryScanRef = useRef<((options?: { background?: boolean }) => void) | null>(null)

  useAppUpdater()
  useKeyboardShortcuts({ activeTab, setActiveTab })

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

  const discover = useDiscoverCatalog({
    discoverSearch,
    enabledSourcesCount,
    defaultDownloadPath,
  })

  const favorites = useFavorites()

  const detailCatalogKey = useMemo(() => {
    const title = discover.gameDetail?.game.title ?? discover.selectedGame?.title
    return title ? catalogGameGroupKey(title) : ''
  }, [discover.gameDetail, discover.selectedGame])

  const detailIsFavorite = detailCatalogKey ? favorites.isFavorite(detailCatalogKey) : false

  const handleToggleDetailFavorite = useCallback(async () => {
    const title = discover.gameDetail?.game.title ?? discover.selectedGame?.title
    if (!title || !detailCatalogKey) return
    setFavoriteBusy(true)
    try {
      await favorites.toggleFavorite(detailCatalogKey, title)
    } catch (error) {
      discover.setDiscoverError(
        error instanceof Error ? error.message : 'Falha ao atualizar favorito.',
      )
    } finally {
      setFavoriteBusy(false)
    }
  }, [detailCatalogKey, discover, favorites])

  const handleOpenFavorite = useCallback(
    (entry: FavoriteEntry) => {
      setActiveTab('discover')
      discover.openGameDetail({ groupKey: entry.catalogKey, title: entry.title })
    },
    [discover, setActiveTab],
  )

  useEffect(() => {
    if (activeTab === 'favorites') {
      void favorites.refresh()
    }
  }, [activeTab, favorites])

  useDeepLinkNavigation({
    onNavigateDiscover: navigateDiscover,
    setDiscoverSearch,
    openGameDetail: discover.openGameDetail,
  })

  const coverCatalogGames = useMemo(() => {
    const games = discover.gameDetail?.game
      ? [...discover.catalogGames, discover.gameDetail.game]
      : [...discover.catalogGames]

    for (const entry of favorites.favorites) {
      if (!games.some((game) => game.title === entry.title)) {
        games.push({
          id: `fav:${entry.catalogKey}`,
          title: entry.title,
          genre: '',
          coverUrl: null,
          localCoverPath: null,
          source: 'source',
        })
      }
    }

    return games
  }, [discover.catalogGames, discover.gameDetail, favorites.favorites])

  const {
    resolveCover,
    warmCover,
    warmCovers,
    refreshCovers,
    syncJobCovers,
    resolveCoversBatch,
    invalidateLocalCover,
  } = useGameCovers(coverCatalogGames)

  useDownloadNotifications(jobs)
  useCatalogChangeNotifications(sources.length > 0)

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
    const visible = discover.displayCatalogSource.slice(0, 80)
    if (visible.length === 0) return

    const titles = visible.map((game) => game.title)
    resolveCoversBatch(titles)

    const directUrls = visible
      .map((game) => {
        const url = game.coverUrl?.trim()
        if (!url) return null
        return { title: game.title, coverUrl: url }
      })
      .filter((item): item is { title: string; coverUrl: string } => item != null)
    if (directUrls.length > 0) {
      warmCovers(directUrls)
    }
  }, [discover.displayCatalogSource, resolveCoversBatch, warmCovers])

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
      discover.closeGameDetail()
      setActiveTab('downloads')
    } catch (error) {
      discover.setDiscoverError(
        formatUserError(error, 'Falha ao adicionar o download à fila.'),
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
            view={discover.view}
            gameDetail={discover.gameDetail}
            detailLoading={discover.detailLoading}
            detailError={discover.detailError}
            isFavorite={detailIsFavorite}
            favoriteBusy={favoriteBusy}
            onToggleFavorite={() => void handleToggleDetailFavorite()}
            catalogError={discover.catalogError}
            discoverError={discover.discoverError}
            clearCatalogError={() => discover.setCatalogError('')}
            clearDiscoverError={() => discover.setDiscoverError('')}
            discoverSearch={discoverSearch}
            catalogLoading={discover.catalogLoading}
            catalogLoadingMore={discover.catalogLoadingMore}
            catalogHasMore={discover.catalogHasMore}
            loadMoreCatalog={discover.loadMoreCatalog}
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
            openGameDetail={(game) => discover.openGameDetail({ title: game.title })}
            closeGameDetail={discover.closeGameDetail}
            closeDiscoverPicker={discover.closeDiscoverPicker}
            handleEnqueueFromDiscover={handleEnqueueFromDiscover}
            resolveCover={resolveCover}
            warmCover={warmCover}
            onNeedsCover={(title) => resolveCoversBatch([title])}
            invalidateLocalCover={invalidateLocalCover}
          />
        )
      case 'favorites':
        return (
          <FavoritesPage
            favorites={favorites.favorites}
            catalogGames={coverCatalogGames}
            loading={favorites.loading}
            onOpenFavorite={handleOpenFavorite}
            warmCover={warmCover}
            resolveCoversBatch={resolveCoversBatch}
            resolveCover={resolveCover}
            invalidateLocalCover={invalidateLocalCover}
          />
        )
      case 'library':
        return (
          <LibraryTab
            jobs={jobs}
            defaultDownloadPath={defaultDownloadPath}
            dispatch={dispatch}
            onGoDiscover={navigateDiscover}
            onGoDownloads={navigateDownloads}
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
            onGoDiscover={navigateDiscover}
            resolveCover={resolveCover}
            invalidateLocalCover={invalidateLocalCover}
          />
        )
      case 'settings':
        return <SettingsTab />
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
