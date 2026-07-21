import { useCallback, useMemo, useState } from 'react'
import { CATALOG_SEARCH_MIN_CHARS } from '../../shared/config/polling'
import type { CatalogGame, GetGameDetailInput } from '../../shared/types/contracts'
import { catalogGameFromInput } from './discoverCatalogGames'
import { discoverPageSize } from './discoverGridPaging'
import { useDiscoverPagination } from './useDiscoverPagination'
import { useDiscoverPicker } from './useDiscoverPicker'
import { useDiscoverSearch } from './useDiscoverSearch'

type UseDiscoverCatalogArgs = {
  discoverSearch: string
  enabledSourcesCount: number
  enabledSourcesKey: string
  defaultDownloadPath: string
  gridColumns?: number
}

export function useDiscoverCatalog({
  discoverSearch,
  enabledSourcesCount,
  enabledSourcesKey,
  defaultDownloadPath,
  gridColumns = 5,
}: UseDiscoverCatalogArgs) {
  const columns = Math.max(1, gridColumns)
  const search = useDiscoverSearch({
    query: discoverSearch,
    enabledSourcesCount,
    enabledSourcesKey,
    pageSize: discoverPageSize(columns, 5),
  })
  const loadMoreCatalog = useDiscoverPagination({
    query: discoverSearch,
    columns,
    catalogGames: search.catalogGames,
    loading: search.catalogLoading,
    loadingMore: search.catalogLoadingMore,
    hasMore: search.catalogHasMore,
    setGames: search.setCatalogGames,
    setLoadingMore: search.setCatalogLoadingMore,
    setHasMore: search.setCatalogHasMore,
  })
  const picker = useDiscoverPicker({
    enabledSourcesCount,
    defaultDownloadPath,
    setCatalogGames: search.setCatalogGames,
  })
  const [discoverBusy, setDiscoverBusy] = useState<string | null>(null)
  const displayCatalogSource = useMemo(
    () =>
      discoverSearch.trim().length < CATALOG_SEARCH_MIN_CHARS
        ? []
        : search.catalogGames,
    [discoverSearch, search.catalogGames],
  )
  const openGameDetail = useCallback(
    (input: GetGameDetailInput | CatalogGame) => {
      picker.open(catalogGameFromInput(input, search.catalogGames))
    },
    [picker, search.catalogGames],
  )

  return {
    catalogGames: search.catalogGames,
    catalogLoading: search.catalogLoading,
    catalogLoadingMore: search.catalogLoadingMore,
    catalogHasMore: search.catalogHasMore,
    loadMoreCatalog,
    discoverBusy,
    setDiscoverBusy,
    discoverPickGame: picker.game,
    discoverPickOptions: picker.options,
    discoverPickSynopsis: picker.synopsis,
    discoverPickScreenshots: picker.screenshots,
    discoverPickLoading: picker.loading,
    discoverPickError: picker.error,
    displayCatalogSource,
    closeDiscoverPicker: picker.close,
    openDiscoverPicker: picker.open,
    openGameDetail,
  }
}
