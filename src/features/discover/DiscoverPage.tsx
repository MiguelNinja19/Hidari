import { useCallback, useEffect, useMemo, useRef } from 'react'
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
import { useDiscoverController } from './DiscoverController'

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

  const { resolveCover, warmCover, invalidateLocalCover, resolveCoversBatch } = useCovers()

  const query = discoverSearch.trim()
  const isSearching = query.length >= 2
  const resultCount = displayCatalogSource.length
  const hasActiveSources = enabledSourcesCount > 0
  const hasCatalogData = useMemo(
    () => sources.some((source) => isSourceEnabled(source.id) && source.downloadCount > 0),
    [sources, isSourceEnabled],
  )

  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)

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
      resultCount === 0
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
    resultCount,
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
        onBack={closeDiscoverPicker}
        onDownload={handleEnqueueFromDiscover}
      />
    )
  }

  return (
    <section
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
                disabled={!hasActiveSources || catalogLoading || discoverSearchDraft.trim().length < 2}
                onClick={submitDiscoverSearch}
              >
                {catalogLoading ? t('discover.searching') : t('common.search')}
              </button>
            }
          />
        </div>
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
        <ul className="discover-grid">
          {displayCatalogSource.map((game, index) => {
            const cover = resolveCover(game.title, game.coverUrl, game.localCoverPath)
            const itemCoverUrl = game.coverUrl?.trim() || cover.coverUrl
            const itemLocalPath = game.localCoverPath?.trim() || cover.localPath
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

      {hasActiveSources && isSearching && resultCount > 0 && (catalogHasMore || catalogLoadingMore) ? (
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

      {hasActiveSources && isSearching && !catalogLoading && resultCount === 0 ? (
        <DiscoverNoResults query={query} />
      ) : null}
    </section>
  )
}
