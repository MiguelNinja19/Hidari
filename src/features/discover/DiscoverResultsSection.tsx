import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Spinner } from '../../shared/components/Spinner'
import type { CatalogGame } from '../../shared/types/contracts'
import { useFavoriteCatalog } from '../favorites/FavoriteCatalogProvider'
import { DiscoverEmptyCatalog } from './DiscoverEmptyCatalog'
import { DiscoverNoResults } from './DiscoverNoResults'
import { DiscoverNoSources } from './DiscoverNoSources'
import { DiscoverSearchSkeleton } from './DiscoverSearchSkeleton'
import { useDiscoverController } from './DiscoverController'
import { useDiscoverLoadMore } from './useDiscoverLoadMore'
import { VirtualizedCatalogGrid } from './VirtualizedCatalogGrid'

export function DiscoverResultsSection() {
  const { t } = useTranslation()
  const controller = useDiscoverController()
  const favorites = useFavoriteCatalog()
  const query = controller.discoverSearch.trim()
  const isSearching = query.length >= 2
  const resultCount = controller.displayCatalogSource.length
  const hasActiveSources = controller.enabledSourcesCount > 0
  const hasCatalogData = useMemo(
    () =>
      controller.sources.some(
        (source) => controller.isSourceEnabled(source.id) && source.downloadCount > 0,
      ),
    [controller],
  )
  const sentinelRef = useDiscoverLoadMore({
    disabled: !hasActiveSources || !isSearching,
    loading: controller.catalogLoading || controller.catalogLoadingMore,
    hasMore: controller.catalogHasMore,
    resultCount,
    loadMore: controller.loadMoreCatalog,
  })
  const openGame = useCallback(
    (game: CatalogGame) => controller.openGameDetail(game),
    [controller],
  )
  const toggleFavorite = useCallback(
    (game: CatalogGame) => {
      if (!favorites.isBusy(game)) void favorites.toggleFavorite(game)
    },
    [favorites],
  )

  if (!controller.sourcesLoading && !hasActiveSources) {
    return <DiscoverNoSources onGoSettings={controller.onGoSettings} />
  }
  if (hasActiveSources && !hasCatalogData && !isSearching) {
    return <DiscoverEmptyCatalog onGoSettings={controller.onGoSettings} />
  }
  if (hasActiveSources && isSearching && controller.catalogLoading && resultCount === 0) {
    return <DiscoverSearchSkeleton />
  }
  if (hasActiveSources && isSearching && !controller.catalogLoading && resultCount === 0) {
    return <DiscoverNoResults query={query} />
  }
  if (!hasActiveSources || !isSearching || resultCount === 0) return null

  return (
    <>
      <VirtualizedCatalogGrid
        games={controller.displayCatalogSource}
        ariaLabel={t('nav.discover')}
        isFavorite={favorites.isFavorite}
        isFavoriteBusy={favorites.isBusy}
        onOpen={openGame}
        onToggleFavorite={toggleFavorite}
        onColumnsChange={controller.setDiscoverGridColumns}
      />
      {controller.catalogHasMore || controller.catalogLoadingMore ? (
        <div
          ref={sentinelRef}
          className="discover-load-more"
          aria-hidden={!controller.catalogLoadingMore}
        >
          {controller.catalogLoadingMore ? (
            <div className="discover-load-more__status">
              <Spinner size="sm" label={t('discover.loadingMore')} />
              <span>{t('discover.loadingMore')}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
