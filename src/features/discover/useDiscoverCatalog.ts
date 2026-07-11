import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CATALOG_SEARCH_MIN_CHARS,
} from '../../shared/config/polling'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { simplifySourceSearchQuery } from '../../shared/utils/titleMatching'
import { cleanTitleForCover } from '../../shared/utils/normalizeTitleKey'
import { formatUserError } from '../../shared/utils/formatUserError'
import { useToast } from '../../shared/components/ToastProvider'
import type { CatalogGame, DownloadOption, GetGameDetailInput } from '../../shared/types/contracts'

const DISCOVER_PAGE_SIZE = 24

function catalogDedupeKey(game: CatalogGame): string {
  return (game.groupKey?.trim() || game.title).trim().toLowerCase()
}

function mergeCatalogGames(base: CatalogGame[], incoming: CatalogGame[]): CatalogGame[] {
  const seen = new Set(base.map(catalogDedupeKey))
  const out = [...base]
  for (const game of incoming) {
    const key = catalogDedupeKey(game)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(game)
  }
  return out
}

const isDownloadableOption = (option: DownloadOption) =>
  option.downloadType === 'torrent' ||
  (option.downloadType === 'http' && !option.url.includes('fitgirl-repacks.site/'))

async function fetchDownloadOptionsForGame(game: CatalogGame): Promise<{
  downloadable: DownloadOption[]
  rawCount: number
}> {
  const groupKey = game.groupKey?.trim() || undefined
  const title = game.title.trim()
  let rawCount = 0

  if (groupKey || title) {
    try {
      const detail = await sourcesApi.getGameDetail({
        groupKey,
        title: title || undefined,
        includeSteam: false,
      })
      rawCount = detail.downloads.length
      const fromDetail = detail.downloads.filter(isDownloadableOption)
      if (fromDetail.length > 0) {
        return { downloadable: fromDetail, rawCount }
      }
    } catch {
      // fallback por título / groupKey abaixo
    }
  }

  const queries = [
    cleanTitleForCover(title),
    simplifySourceSearchQuery(cleanTitleForCover(title)),
  ].filter((query, index, all) => query.length >= 2 && all.indexOf(query) === index)

  for (const query of queries) {
    const rows = await sourcesApi.searchDownloadOptions({
      query,
      groupKey,
    })
    rawCount = Math.max(rawCount, rows.length)
    const downloadable = rows.filter(isDownloadableOption)
    if (downloadable.length > 0) {
      return { downloadable, rawCount }
    }
  }

  return { downloadable: [], rawCount }
}

type UseDiscoverCatalogArgs = {
  discoverSearch: string
  enabledSourcesCount: number
  enabledSourcesKey: string
  defaultDownloadPath: string
}

function isCatalogGame(input: GetGameDetailInput | CatalogGame): input is CatalogGame {
  return 'source' in input
}

function catalogGameFromInput(
  input: GetGameDetailInput | CatalogGame,
  catalogGames: CatalogGame[],
): CatalogGame {
  if (isCatalogGame(input)) return input

  const groupKey = input.groupKey?.trim()
  const title = input.title?.trim() ?? ''
  const fromCatalog = catalogGames.find(
    (game) =>
      (groupKey && game.groupKey === groupKey) ||
      (title && game.title.localeCompare(title, undefined, { sensitivity: 'base' }) === 0),
  )
  if (fromCatalog) return fromCatalog

  return {
    id: groupKey ? `group:${groupKey}` : `title:${title}`,
    title,
    genre: '',
    coverUrl: null,
    localCoverPath: null,
    source: 'catalog',
    groupKey: groupKey || null,
  }
}

export function useDiscoverCatalog({
  discoverSearch,
  enabledSourcesCount,
  enabledSourcesKey,
  defaultDownloadPath,
}: UseDiscoverCatalogArgs) {
  const { showError } = useToast()
  const { t } = useTranslation()
  const [catalogGames, setCatalogGames] = useState<CatalogGame[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false)
  const [catalogHasMore, setCatalogHasMore] = useState(false)
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
      const applyIfCurrent = (fn: () => void) => {
        if (
          !cancelled &&
          searchRequestIdRef.current === requestId &&
          discoverSearch.trim() === requestQuery
        ) {
          fn()
        }
      }

      try {
        // 1) Cache/JSON local — UI imediata
        const localRows = await sourcesApi.searchGameCatalog({
          query: requestQuery,
          includeSteam: false,
          onlyWithSources: true,
          attachCovers: true,
          localOnly: true,
          offset: 0,
          limit: DISCOVER_PAGE_SIZE + 1,
        })
        applyIfCurrent(() => {
          setCatalogHasMore(localRows.length > DISCOVER_PAGE_SIZE)
          setCatalogGames(localRows.slice(0, DISCOVER_PAGE_SIZE))
          setCatalogLoading(false)
        })

        // 2) API Hydra em paralelo no backend — enriquece sem bloquear a primeira pintura
        const fullRows = await sourcesApi.searchGameCatalog({
          query: requestQuery,
          includeSteam: false,
          onlyWithSources: true,
          attachCovers: true,
          localOnly: false,
          offset: 0,
          limit: DISCOVER_PAGE_SIZE + 1,
        })
        applyIfCurrent(() => {
          setCatalogGames(fullRows.slice(0, DISCOVER_PAGE_SIZE))
          setCatalogHasMore(fullRows.length > DISCOVER_PAGE_SIZE)
        })
      } catch (error) {
        applyIfCurrent(() => {
          showError(formatUserError(error, t('discover.searchError')))
          setCatalogLoading(false)
        })
      } finally {
        applyIfCurrent(() => {
          setCatalogLoading(false)
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [discoverSearch, enabledSourcesCount, enabledSourcesKey, showError, t])

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
        attachCovers: true,
        localOnly: false,
        offset: catalogGames.length,
        limit: DISCOVER_PAGE_SIZE + 1,
      })
      setCatalogHasMore(rows.length > DISCOVER_PAGE_SIZE)
      setCatalogGames((prev) => mergeCatalogGames(prev, rows.slice(0, DISCOVER_PAGE_SIZE)))
    } catch (error) {
      showError(formatUserError(error, t('discover.loadMoreError')))
    } finally {
      setCatalogLoadingMore(false)
    }
  }, [catalogGames.length, catalogHasMore, catalogLoading, catalogLoadingMore, discoverSearch, showError, t])

  const closeDiscoverPicker = useCallback(() => {
    setDiscoverPickGame(null)
    setDiscoverPickOptions([])
    setDiscoverPickError(null)
    setDiscoverPickLoading(false)
  }, [])

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
          reportPickError(t('discover.noActiveSourcesPick'))
          setDiscoverPickLoading(false)
          return
        }

        const hasPath =
          defaultDownloadPath.trim().length > 0 || (await sourcesApi.getDefaultDownloadPath())
        if (!hasPath) {
          reportPickError(t('discover.noDownloadPath'))
          setDiscoverPickLoading(false)
          return
        }

        try {
          const { downloadable, rawCount } = await fetchDownloadOptionsForGame(game)
          setDiscoverPickOptions(downloadable)
          if (downloadable.length === 0) {
            reportPickError(
              rawCount > 0 ? t('discover.pickInvalidOptions') : t('discover.pickNoDownloads'),
            )
          }
        } catch {
          setDiscoverPickOptions([])
          reportPickError(t('discover.pickFetchError'))
        } finally {
          setDiscoverPickLoading(false)
        }
      })()
    },
    [defaultDownloadPath, enabledSourcesCount, reportPickError, t],
  )

  const openGameDetail = useCallback(
    (input: GetGameDetailInput | CatalogGame) => {
      const game = catalogGameFromInput(input, catalogGames)
      openDiscoverPicker(game)
    },
    [catalogGames, openDiscoverPicker],
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
  }
}
