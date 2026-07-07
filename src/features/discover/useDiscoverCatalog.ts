import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CATALOG_SEARCH_DEBOUNCE_MS,
  CATALOG_SEARCH_MIN_CHARS,
} from '../../shared/config/polling'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { simplifySourceSearchQuery } from '../../shared/utils/titleMatching'
import { cleanTitleForCover } from '../../shared/utils/normalizeTitleKey'
import type { CatalogGame, DownloadOption } from '../../shared/types/contracts'

const DISCOVER_PAGE_SIZE = 24

const isDownloadableOption = (option: DownloadOption) =>
  option.downloadType === 'torrent' ||
  (option.downloadType === 'http' && !option.url.includes('fitgirl-repacks.site/'))

type UseDiscoverCatalogArgs = {
  discoverSearch: string
  enabledSourcesCount: number
  defaultDownloadPath: string
}

export function useDiscoverCatalog({
  discoverSearch,
  enabledSourcesCount,
  defaultDownloadPath,
}: UseDiscoverCatalogArgs) {
  const [catalogGames, setCatalogGames] = useState<CatalogGame[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false)
  const [catalogHasMore, setCatalogHasMore] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [discoverError, setDiscoverError] = useState('')
  const [discoverBusy, setDiscoverBusy] = useState<string | null>(null)
  const [discoverPickGame, setDiscoverPickGame] = useState<CatalogGame | null>(null)
  const [discoverPickOptions, setDiscoverPickOptions] = useState<DownloadOption[]>([])
  const [discoverPickLoading, setDiscoverPickLoading] = useState(false)
  const [discoverPickError, setDiscoverPickError] = useState<string | null>(null)

  const displayCatalogSource = useMemo(() => {
    const q = discoverSearch.trim()
    if (q.length < CATALOG_SEARCH_MIN_CHARS) return []
    return catalogGames
  }, [catalogGames, discoverSearch])

  const searchRequestIdRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const query = discoverSearch.trim()
    if (query.length < CATALOG_SEARCH_MIN_CHARS) {
      setCatalogGames([])
      setCatalogLoading(false)
      setCatalogLoadingMore(false)
      setCatalogHasMore(false)
      setCatalogError('')
      return
    }

    if (enabledSourcesCount === 0) {
      setCatalogGames([])
      setCatalogLoading(false)
      setCatalogLoadingMore(false)
      setCatalogHasMore(false)
      setCatalogError('')
      return
    }

    setCatalogError('')

    const timer = window.setTimeout(() => {
      const requestQuery = discoverSearch.trim()
      const requestId = ++searchRequestIdRef.current
      setCatalogLoading(true)

      void (async () => {
        try {
          const rows = await sourcesApi.searchGameCatalog({
            query: requestQuery,
            includeSteam: false,
            onlyWithSources: true,
            attachCovers: false,
            offset: 0,
            limit: DISCOVER_PAGE_SIZE + 1,
          })
          if (
            !cancelled &&
            searchRequestIdRef.current === requestId &&
            discoverSearch.trim() === requestQuery
          ) {
            setCatalogHasMore(rows.length > DISCOVER_PAGE_SIZE)
            setCatalogGames(rows.slice(0, DISCOVER_PAGE_SIZE))
            setCatalogError('')
          }
        } catch (error) {
          if (
            !cancelled &&
            searchRequestIdRef.current === requestId &&
            discoverSearch.trim() === requestQuery
          ) {
            setCatalogError(
              error instanceof Error
                ? error.message
                : 'Falha ao pesquisar nas fontes. Tente novamente.',
            )
          }
        } finally {
          if (
            !cancelled &&
            searchRequestIdRef.current === requestId &&
            discoverSearch.trim() === requestQuery
          ) {
            setCatalogLoading(false)
          }
        }
      })()
    }, CATALOG_SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [discoverSearch, enabledSourcesCount])

  const loadMoreCatalog = useCallback(async () => {
    const query = discoverSearch.trim()
    if (
      query.length < CATALOG_SEARCH_MIN_CHARS ||
      catalogLoading ||
      catalogLoadingMore ||
      !catalogHasMore
    ) {
      return
    }

    setCatalogLoadingMore(true)
    try {
      const rows = await sourcesApi.searchGameCatalog({
        query,
        includeSteam: false,
        onlyWithSources: true,
        attachCovers: false,
        offset: catalogGames.length,
        limit: DISCOVER_PAGE_SIZE + 1,
      })
      setCatalogHasMore(rows.length > DISCOVER_PAGE_SIZE)
      setCatalogGames((prev) => [...prev, ...rows.slice(0, DISCOVER_PAGE_SIZE)])
    } catch (error) {
      setCatalogError(
        error instanceof Error
          ? error.message
          : 'Falha ao carregar mais resultados. Tente novamente.',
      )
    } finally {
      setCatalogLoadingMore(false)
    }
  }, [catalogGames.length, catalogHasMore, catalogLoading, catalogLoadingMore, discoverSearch])

  const closeDiscoverPicker = useCallback(() => {
    setDiscoverPickGame(null)
    setDiscoverPickOptions([])
    setDiscoverPickError(null)
    setDiscoverPickLoading(false)
  }, [])

  const openDiscoverPicker = useCallback(
    (game: CatalogGame) => {
      setDiscoverError('')
      setDiscoverPickGame(game)
      setDiscoverPickOptions([])
      setDiscoverPickError(null)
      setDiscoverPickLoading(true)

      void (async () => {
        if (enabledSourcesCount === 0) {
          setDiscoverPickError(
            'Nenhuma fonte ativa. Ative pelo menos uma fonte em Configurações.',
          )
          setDiscoverPickLoading(false)
          return
        }

        const hasPath =
          defaultDownloadPath.trim().length > 0 || (await sourcesApi.getDefaultDownloadPath())
        if (!hasPath) {
          setDiscoverPickError(
            'Defina a pasta de downloads em Configurações antes de baixar.',
          )
          setDiscoverPickLoading(false)
          return
        }

        try {
          const rows = await sourcesApi.searchDownloadOptions({
            query: simplifySourceSearchQuery(cleanTitleForCover(game.title)),
          })
          const downloadable = rows.filter(isDownloadableOption)
          setDiscoverPickOptions(downloadable)
          if (downloadable.length === 0) {
            setDiscoverPickError(
              rows.length > 0
                ? 'Foram encontradas opções, mas nenhum download válido. Tente outro jogo ou fonte.'
                : 'Nenhum download encontrado para este título. Verifique as fontes ativas em Configurações.',
            )
          }
        } catch {
          setDiscoverPickOptions([])
          setDiscoverPickError(
            'Não foi possível consultar as fontes. Verifique a conexão e tente novamente.',
          )
        } finally {
          setDiscoverPickLoading(false)
        }
      })()
    },
    [defaultDownloadPath, enabledSourcesCount],
  )

  useEffect(() => {
    if (!discoverPickGame) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDiscoverPicker()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [discoverPickGame, closeDiscoverPicker])

  return {
    catalogGames,
    catalogLoading,
    catalogLoadingMore,
    catalogHasMore,
    loadMoreCatalog,
    catalogError,
    discoverError,
    setDiscoverError,
    discoverBusy,
    setDiscoverBusy,
    discoverPickGame,
    discoverPickOptions,
    discoverPickLoading,
    discoverPickError,
    displayCatalogSource,
    closeDiscoverPicker,
    openDiscoverPicker,
  }
}
