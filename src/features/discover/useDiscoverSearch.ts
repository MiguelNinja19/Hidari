import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CATALOG_SEARCH_MIN_CHARS } from '../../shared/config/polling'
import { useToast } from '../../shared/components/ToastProvider'
import type { CatalogGame } from '../../shared/types/contracts'
import { formatUserError } from '../../shared/utils/formatUserError'
import { dedupeCatalogGames, mergeInitialCatalog } from './discoverCatalogGames'
import { searchCachedCatalog, searchFreshCatalog } from './discoverCatalogSearch'
import type { UseDiscoverSearchArgs } from './discoverSearchTypes'

export function useDiscoverSearch({
  query,
  enabledSourcesCount,
  enabledSourcesKey,
  pageSize,
}: UseDiscoverSearchArgs) {
  const { showError } = useToast()
  const { t } = useTranslation()
  const [catalogGames, setCatalogGames] = useState<CatalogGame[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false)
  const [catalogHasMore, setCatalogHasMore] = useState(false)
  const requestIdRef = useRef(0)
  const pageSizeRef = useRef(pageSize)
  pageSizeRef.current = pageSize

  useEffect(() => {
    let cancelled = false
    const requestQuery = query.trim()
    const clear = () => {
      setCatalogGames([])
      setCatalogLoading(false)
      setCatalogLoadingMore(false)
      setCatalogHasMore(false)
    }
    if (
      requestQuery.length < CATALOG_SEARCH_MIN_CHARS ||
      enabledSourcesCount === 0
    ) {
      clear()
      return
    }

    const requestId = ++requestIdRef.current
    const startedAt = Date.now()
    const apply = (fn: () => void) => {
      if (!cancelled && requestIdRef.current === requestId && query.trim() === requestQuery) fn()
    }
    setCatalogLoading(true)
    setCatalogGames([])
    setCatalogHasMore(false)

    void (async () => {
      try {
        const cached = await searchCachedCatalog(requestQuery, pageSizeRef.current + 1)
        apply(() => {
          const size = pageSizeRef.current
          setCatalogHasMore(cached.length > size)
          setCatalogGames(dedupeCatalogGames(cached.slice(0, size)))
          if (cached.length > 0) setCatalogLoading(false)
        })
        const fresh = await searchFreshCatalog(requestQuery, pageSizeRef.current + 1)
        apply(() => {
          const size = pageSizeRef.current
          setCatalogGames((previous) =>
            mergeInitialCatalog(previous, fresh.slice(0, size)),
          )
          setCatalogHasMore(fresh.length > size || cached.length > size)
        })
      } catch (error) {
        apply(() => showError(formatUserError(error, t('discover.searchError'))))
      } finally {
        const remaining = Math.max(0, 200 - (Date.now() - startedAt))
        if (remaining > 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, remaining))
        }
        apply(() => setCatalogLoading(false))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabledSourcesCount, enabledSourcesKey, query, showError, t])

  return {
    catalogGames,
    setCatalogGames,
    catalogLoading,
    catalogLoadingMore,
    setCatalogLoadingMore,
    catalogHasMore,
    setCatalogHasMore,
  }
}
