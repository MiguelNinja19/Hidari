import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { CATALOG_SEARCH_MIN_CHARS } from '../../shared/config/polling'
import { useToast } from '../../shared/components/ToastProvider'
import type { CatalogGame } from '../../shared/types/contracts'
import { formatUserError } from '../../shared/utils/formatUserError'
import { mergeCatalogGames } from './discoverCatalogGames'
import { searchFreshCatalog } from './discoverCatalogSearch'
import { discoverLoadMoreLimit } from './discoverGridPaging'

type PaginationArgs = {
  query: string
  columns: number
  catalogGames: CatalogGame[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  setGames: Dispatch<SetStateAction<CatalogGame[]>>
  setLoadingMore: Dispatch<SetStateAction<boolean>>
  setHasMore: Dispatch<SetStateAction<boolean>>
}

export function useDiscoverPagination(args: PaginationArgs) {
  const { showError } = useToast()
  const { t } = useTranslation()
  const inFlightRef = useRef(false)
  const columnsRef = useRef(args.columns)
  columnsRef.current = args.columns

  return useCallback(async () => {
    const query = args.query.trim()
    if (
      query.length < CATALOG_SEARCH_MIN_CHARS ||
      args.loading ||
      args.loadingMore ||
      inFlightRef.current ||
      !args.hasMore
    ) {
      return
    }

    inFlightRef.current = true
    args.setLoadingMore(true)
    try {
      const limit = discoverLoadMoreLimit(args.catalogGames.length, columnsRef.current, 5)
      const rows = await searchFreshCatalog(
        query,
        limit + 1,
        args.catalogGames.length,
      )
      args.setHasMore(rows.length > limit)
      args.setGames((previous) => mergeCatalogGames(previous, rows.slice(0, limit)))
    } catch (error) {
      showError(formatUserError(error, t('discover.loadMoreError')))
    } finally {
      inFlightRef.current = false
      args.setLoadingMore(false)
    }
  }, [args, showError, t])
}
