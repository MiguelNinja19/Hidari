import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DiscoverNoSources } from './DiscoverNoSources'
import { DiscoverEmptyCatalog } from './DiscoverEmptyCatalog'
import { DiscoverNoResults } from './DiscoverNoResults'
import { DiscoverGameDetailPage } from './DiscoverGameDetailPage'
import { CatalogCover } from '../../shared/components/CatalogCover'
import { DiscoverGameCard } from './DiscoverGameCard'
import { Spinner } from '../../shared/components/Spinner'
import { SearchInput } from '../../shared/components/ui/SearchInput'
import { CoverWarmGridItem } from '../covers/CoverWarmGridItem'
import { useCovers } from '../covers/CoversProvider'
import { catalogGameDisplayTitle } from '../../shared/utils/normalizeTitleKey'
import { favoriteCatalogKeyForGame } from '../../shared/utils/favoriteCatalogKey'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { formatUserError } from '../../shared/utils/formatUserError'
import { useToast } from '../../shared/components/ToastProvider'
import { useDiscoverController } from './DiscoverController'
import { resolveDiscoverColumns } from './discoverGridPaging'

const SEARCH_SKELETON_COUNT = 12

function DiscoverSearchSkeleton() {
  return (
    <ul className="discover-grid discover-grid--skeleton" aria-hidden="true">
      {Array.from({ length: SEARCH_SKELETON_COUNT }, (_, index) => (
        <li key={index} className="discover-grid__item">
          <article className="discover-card discover-card--explore discover-card--skeleton">
            <div className="discover-card__panel">
              <div className="discover-card__cover--skeleton skeleton-pulse" />
            </div>
          </article>
        </li>
      ))}
    </ul>
  )
}

export function DiscoverPage() {
  const { t } = useTranslation()
  const {
    discoverSearch,
    discoverSearchDraft,
    setDiscoverSearchDraft,
    submitDiscoverSearch,
    catalogLoading,
    catalogLoadingMore,
    catalogHasMore,
    loadMoreCatalog,
    setDiscoverGridColumns,
    displayCatalogSource,
    discoverPickGame,
    discoverPickLoading,
    discoverPickError,
    discoverPickOptions,
    discoverPickSynopsis,
    discoverPickScreenshots,
    discoverBusy,
    enabledSourcesCount,
    sources,
    sourcesLoading,
    isSourceEnabled,
    onGoSettings,
    openGameDetail,
    closeDiscoverPicker,
    handleEnqueueFromDiscover,
  } = useDiscoverController()

  const { showError } = useToast()
  const { resolveCover, warmCover, invalidateLocalCover, resolveCoversBatch } = useCovers()
  const [favorite, setFavorite] = useState(false)
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)

  const enabledSources = useMemo(
    () => sources.filter((source) => isSourceEnabled(source.id)),
    [sources, isSourceEnabled],
  )

  useEffect(() => {
    if (!discoverPickGame) {
      setFavorite(false)
      return
    }
    let cancelled = false
    const key = favoriteCatalogKeyForGame(discoverPickGame)
    void sourcesApi
      .isFavoriteCatalogEntry(key)
      .then((value) => {
        if (!cancelled) setFavorite(value)
      })
      .catch(() => {
        if (!cancelled) setFavorite(false)
      })
    return () => {
      cancelled = true
    }
  }, [discoverPickGame])

  const handleToggleFavorite = useCallback(async () => {
    if (!discoverPickGame || favoriteBusy) return
    setFavoriteBusy(true)
    try {
      const next = await sourcesApi.toggleFavoriteCatalogEntry(
        discoverPickGame.title,
        favoriteCatalogKeyForGame(discoverPickGame),
      )
      setFavorite(next)
    } catch (error) {
      showError(formatUserError(error, t('discover.favoriteError')))
    } finally {
      setFavoriteBusy(false)
    }
  }, [discoverPickGame, favoriteBusy, showError, t])

  const query = discoverSearch.trim()
  const isSearching = query.length >= 2

  const filteredSearchGames = useMemo(() => {
    if (!sourceFilter) return displayCatalogSource
    const needle = sourceFilter.trim().toLowerCase()
    return displayCatalogSource.filter((game) => {
      const src = game.source?.trim()
      if (!src) return true
      return src.toLowerCase() === needle || src.toLowerCase().includes(needle)
    })
  }, [displayCatalogSource, sourceFilter])

  const resultCount = filteredSearchGames.length
  const hasActiveSources = enabledSourcesCount > 0
  const hasCatalogData = useMemo(
    () => sources.some((source) => isSourceEnabled(source.id) && source.downloadCount > 0),
    [sources, isSourceEnabled],
  )

  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const discoverGridRef = useRef<HTMLUListElement>(null)
  const discoverPageRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const target = discoverGridRef.current ?? discoverPageRef.current
    if (!target) return

    const publish = () => {
      setDiscoverGridColumns(resolveDiscoverColumns(target))
    }
    publish()

    const observer = new ResizeObserver(() => {
      publish()
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [setDiscoverGridColumns, resultCount, isSearching])

  const onNeedsCover = useCallback(
    (title: string) => {
      resolveCoversBatch([title])
    },
    [resolveCoversBatch],
  )

  useEffect(() => {
    if (
      discoverPickGame ||
      !hasActiveSources ||
      !isSearching ||
      catalogLoading ||
      !catalogHasMore ||
      displayCatalogSource.length === 0
    ) {
      return
    }

    const node = loadMoreSentinelRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        void loadMoreCatalog()
      },
      { rootMargin: '480px 0px', threshold: 0 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [
    discoverPickGame,
    hasActiveSources,
    isSearching,
    catalogLoading,
    catalogLoadingMore,
    catalogHasMore,
    displayCatalogSource.length,
    loadMoreCatalog,
  ])

  if (discoverPickGame) {
    return (
      <DiscoverGameDetailPage
        game={discoverPickGame}
        loading={discoverPickLoading}
        error={discoverPickError}
        options={discoverPickOptions}
        synopsis={discoverPickSynopsis}
        screenshots={discoverPickScreenshots}
        busyUrl={discoverBusy}
        favorite={favorite}
        favoriteBusy={favoriteBusy}
        onToggleFavorite={() => void handleToggleFavorite()}
        onBack={closeDiscoverPicker}
        onDownload={handleEnqueueFromDiscover}
      />
    )
  }

  return (
    <section
      ref={discoverPageRef}
      className={`browse-page${catalogLoading && resultCount > 0 ? ' browse-page--loading' : ''}`}
    >
      <header className="page-toolbar page-toolbar--discover">
        <div className="page-toolbar__search">
          <SearchInput
            value={discoverSearchDraft}
            searchFocusId="discover"
            className="browse-search browse-search--soft"
            inputClassName="browse-search__input"
            placeholder={
              hasActiveSources
                ? t('discover.searchPlaceholder')
                : t('discover.searchPlaceholderNoSources')
            }
            disabled={!hasActiveSources}
            onChange={setDiscoverSearchDraft}
            onSubmit={submitDiscoverSearch}
            trailing={
              <button
                type="button"
                className="browse-search__submit"
                disabled={
                  !hasActiveSources ||
                  catalogLoading ||
                  discoverSearchDraft.trim().length < 2
                }
                onClick={submitDiscoverSearch}
              >
                {catalogLoading ? t('discover.searching') : t('common.search')}
              </button>
            }
          />
        </div>
        {isSearching && enabledSources.length > 1 ? (
          <div className="page-toolbar__filters" role="toolbar" aria-label={t('discover.filtersAria')}>
            {enabledSources.map((source) => (
              <button
                key={source.id}
                type="button"
                className={`chip${sourceFilter === source.name ? ' chip--active' : ''}`}
                aria-pressed={sourceFilter === source.name}
                onClick={() =>
                  setSourceFilter((prev) => (prev === source.name ? null : source.name))
                }
              >
                {source.name}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {!sourcesLoading && !hasActiveSources ? (
        <DiscoverNoSources onGoSettings={onGoSettings} />
      ) : null}

      {hasActiveSources && !hasCatalogData && !isSearching ? (
        <DiscoverEmptyCatalog onGoSettings={onGoSettings} />
      ) : null}

      {hasActiveSources && isSearching && catalogLoading && resultCount === 0 ? (
        <DiscoverSearchSkeleton />
      ) : null}

      {hasActiveSources && isSearching && resultCount > 0 ? (
        <ul
          ref={discoverGridRef}
          className="discover-grid"
          role="list"
          aria-label={t('nav.discover')}
        >
          {filteredSearchGames.map((game, index) => {
            const cover = resolveCover(game.title, game.coverUrl, game.localCoverPath)
            const catalogUrl = game.coverUrl?.trim() || null
            const itemCoverUrl = catalogUrl || cover.coverUrl
            const itemLocalPath =
              (cover.localPath &&
              (!catalogUrl || cover.coverUrl === catalogUrl)
                ? cover.localPath
                : null) ||
              game.localCoverPath?.trim() ||
              null
            const displayTitle = catalogGameDisplayTitle(game.title)
            const hasCover =
              cover.status !== 'error' && Boolean(itemLocalPath || itemCoverUrl)

            return (
              <CoverWarmGridItem
                key={game.id}
                title={game.title}
                coverUrl={itemCoverUrl}
                warmCover={warmCover}
                onNeedsCover={onNeedsCover}
                className="discover-grid__item"
              >
                <DiscoverGameCard
                  title={displayTitle}
                  titleAttr={game.title}
                  genre=""
                  showTitle={!hasCover}
                  cover={
                    <CatalogCover
                      title={game.title}
                      coverUrl={itemCoverUrl}
                      localPath={itemLocalPath}
                      cached={Boolean(itemLocalPath)}
                      status={cover.status}
                      priority={index < 8}
                      onLocalCoverError={() =>
                        invalidateLocalCover(game.title, itemCoverUrl ?? game.coverUrl)
                      }
                    />
                  }
                  actionLabel={t('discover.viewSources')}
                  onOpen={() => openGameDetail(game)}
                />
              </CoverWarmGridItem>
            )
          })}
        </ul>
      ) : null}

      {hasActiveSources &&
      isSearching &&
      resultCount > 0 &&
      (catalogHasMore || catalogLoadingMore) ? (
        <div
          ref={loadMoreSentinelRef}
          className="discover-load-more"
          aria-hidden={!catalogLoadingMore}
        >
          {catalogLoadingMore ? (
            <div className="discover-load-more__status">
              <Spinner size="sm" label={t('discover.loadingMore')} />
              <span>{t('discover.loadingMore')}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {hasActiveSources &&
      isSearching &&
      !catalogLoading &&
      filteredSearchGames.length === 0 ? (
        <DiscoverNoResults query={query} />
      ) : null}
    </section>
  )
}
