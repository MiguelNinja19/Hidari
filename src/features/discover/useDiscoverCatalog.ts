import { useCallback, useEffect, useMemo, useState } from 'react'
import { CATALOG_SEARCH_DEBOUNCE_MS } from '../../shared/config/polling'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { simplifySourceSearchQuery } from '../../shared/utils/titleMatching'
import type { CatalogGame, DownloadOption } from '../../shared/types/contracts'

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
  const [catalogError, setCatalogError] = useState('')
  const [discoverError, setDiscoverError] = useState('')
  const [discoverBusy, setDiscoverBusy] = useState<string | null>(null)
  const [discoverPickGame, setDiscoverPickGame] = useState<CatalogGame | null>(null)
  const [discoverPickOptions, setDiscoverPickOptions] = useState<DownloadOption[]>([])
  const [discoverPickLoading, setDiscoverPickLoading] = useState(false)
  const [discoverPickError, setDiscoverPickError] = useState<string | null>(null)

  const displayCatalogSource = useMemo(() => {
    const q = discoverSearch.trim()
    if (q.length < 2) return []
    return catalogGames
  }, [catalogGames, discoverSearch])

  useEffect(() => {
    let cancelled = false
    const query = discoverSearch.trim()
    if (query.length < 2) {
      setCatalogGames([])
      setCatalogLoading(false)
      setCatalogError('')
      return
    }

    if (enabledSourcesCount === 0) {
      setCatalogGames([])
      setCatalogLoading(false)
      setCatalogError('')
      return
    }

    const timer = window.setTimeout(() => {
      setCatalogLoading(true)
      void (async () => {
        try {
          const rows = await sourcesApi.searchGameCatalog({
            query: discoverSearch,
            includeSteam: false,
            onlyWithSources: true,
          })
          if (!cancelled) {
            setCatalogGames(rows)
            setCatalogError('')
          }
        } catch (error) {
          if (!cancelled) {
            setCatalogError(
              error instanceof Error
                ? error.message
                : 'Falha ao pesquisar nas fontes. Tente novamente.',
            )
          }
        } finally {
          if (!cancelled) setCatalogLoading(false)
        }
      })()
    }, CATALOG_SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [discoverSearch, enabledSourcesCount])

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
            'Nenhuma fonte ativa. Ative pelo menos uma fonte (ex.: FitGirl) em Configurações.',
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
            query: simplifySourceSearchQuery(game.title),
          })
          const downloadable = rows.filter(isDownloadableOption)
          setDiscoverPickOptions(downloadable)
          if (downloadable.length === 0) {
            setDiscoverPickError(
              rows.length > 0
                ? 'Foram encontradas páginas, mas sem torrents válidos. Tente outro jogo ou fonte.'
                : 'Nenhum torrent encontrado para este título. Verifique se a fonte FitGirl está ativa.',
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
