import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CATALOG_SEARCH_MIN_CHARS,
} from '../../shared/config/polling'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { simplifySourceSearchQuery } from '../../shared/utils/titleMatching'
import { cleanTitleForCover } from '../../shared/utils/normalizeTitleKey'
import { formatUserError } from '../../shared/utils/formatUserError'
import { useToast } from '../../shared/components/ToastProvider'
import type { CatalogGame, DownloadOption, GameDetail, GetGameDetailInput } from '../../shared/types/contracts'

const DISCOVER_PAGE_SIZE = 24

export type DiscoverView = 'grid' | 'detail'

export type SelectedGameRef = {
  groupKey?: string
  title: string
}

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
  const { showError } = useToast()
  const [catalogGames, setCatalogGames] = useState<CatalogGame[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false)
  const [catalogHasMore, setCatalogHasMore] = useState(false)
  const [discoverBusy, setDiscoverBusy] = useState<string | null>(null)
  const [discoverPickGame, setDiscoverPickGame] = useState<CatalogGame | null>(null)
  const [discoverPickOptions, setDiscoverPickOptions] = useState<DownloadOption[]>([])
  const [discoverPickLoading, setDiscoverPickLoading] = useState(false)
  const [discoverPickError, setDiscoverPickError] = useState<string | null>(null)
  const [view, setView] = useState<DiscoverView>('grid')
  const [selectedGame, setSelectedGame] = useState<SelectedGameRef | null>(null)
  const [gameDetail, setGameDetail] = useState<GameDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

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
      return
    }

    if (enabledSourcesCount === 0) {
      setCatalogGames([])
      setCatalogLoading(false)
      setCatalogLoadingMore(false)
      setCatalogHasMore(false)
      return
    }

    const requestQuery = query
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
        }
      } catch (error) {
        if (
          !cancelled &&
          searchRequestIdRef.current === requestId &&
          discoverSearch.trim() === requestQuery
        ) {
          showError(formatUserError(error, 'Falha ao pesquisar nas fontes. Tente novamente.'))
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

    return () => {
      cancelled = true
    }
  }, [discoverSearch, enabledSourcesCount, showError])

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
      showError(formatUserError(error, 'Falha ao carregar mais resultados. Tente novamente.'))
    } finally {
      setCatalogLoadingMore(false)
    }
  }, [catalogGames.length, catalogHasMore, catalogLoading, catalogLoadingMore, discoverSearch, showError])

  const closeDiscoverPicker = useCallback(() => {
    setDiscoverPickGame(null)
    setDiscoverPickOptions([])
    setDiscoverPickError(null)
    setDiscoverPickLoading(false)
  }, [])

  const closeGameDetail = useCallback(() => {
    setView('grid')
    setSelectedGame(null)
    setGameDetail(null)
    setDetailLoading(false)
    setDetailError('')
  }, [])

  const openGameDetail = useCallback((input: GetGameDetailInput) => {
    const groupKey = input.groupKey?.trim()
    const title = input.title?.trim()
    if (!groupKey && !title) return

    setView('detail')
    setSelectedGame({
      groupKey: groupKey || undefined,
      title: title ?? '',
    })
    setGameDetail(null)
    setDetailError('')
    setDetailLoading(true)

    void (async () => {
      try {
        const detail = await sourcesApi.getGameDetail({
          groupKey: groupKey || undefined,
          title: title || undefined,
        })
        setGameDetail(detail)
        if (detail.game.genre.trim()) {
          setCatalogGames((prev) =>
            prev.map((game) =>
              game.title === detail.game.title ? { ...game, genre: detail.game.genre } : game,
            ),
          )
        }
        setSelectedGame({
          groupKey: groupKey || undefined,
          title: detail.game.title,
        })
      } catch (error) {
        const message = formatUserError(error, 'Não foi possível carregar os detalhes do jogo.')
        setDetailError(message)
        showError(message)
      } finally {
        setDetailLoading(false)
      }
    })()
  }, [showError])

  const reportPickError = useCallback(
    (message: string) => {
      setDiscoverPickError(message)
      showError(message)
    },
    [showError],
  )

  const openDiscoverPicker = useCallback(
    (game: CatalogGame) => {
      setDiscoverPickGame(game)
      setDiscoverPickOptions([])
      setDiscoverPickError(null)
      setDiscoverPickLoading(true)

      void (async () => {
        if (enabledSourcesCount === 0) {
          reportPickError('Nenhuma fonte ativa. Ative pelo menos uma fonte em Configurações.')
          setDiscoverPickLoading(false)
          return
        }

        const hasPath =
          defaultDownloadPath.trim().length > 0 || (await sourcesApi.getDefaultDownloadPath())
        if (!hasPath) {
          reportPickError('Defina a pasta de downloads em Configurações antes de baixar.')
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
            reportPickError(
              rows.length > 0
                ? 'Foram encontradas opções, mas nenhum download válido. Tente outro jogo ou fonte.'
                : 'Nenhum download encontrado para este título. Verifique as fontes ativas em Configurações.',
            )
          }
        } catch {
          setDiscoverPickOptions([])
          reportPickError(
            'Não foi possível consultar as fontes. Verifique a conexão e tente novamente.',
          )
        } finally {
          setDiscoverPickLoading(false)
        }
      })()
    },
    [defaultDownloadPath, enabledSourcesCount, reportPickError],
  )

  useEffect(() => {
    if (!discoverPickGame) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDiscoverPicker()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [discoverPickGame, closeDiscoverPicker])

  useEffect(() => {
    if (view !== 'detail') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeGameDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, closeGameDetail])

  return {
    view,
    selectedGame,
    gameDetail,
    detailLoading,
    detailError,
    catalogGames,
    catalogLoading,
    catalogLoadingMore,
    catalogHasMore,
    loadMoreCatalog,
    discoverBusy,
    setDiscoverBusy,
    discoverPickGame,
    discoverPickOptions,
    discoverPickLoading,
    discoverPickError,
    displayCatalogSource,
    closeDiscoverPicker,
    openDiscoverPicker,
    openGameDetail,
    closeGameDetail,
  }
}
