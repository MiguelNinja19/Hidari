import { useCallback, useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { useAppSettings } from '../../app/context/AppSettingsContext'
import { enqueueJob } from '../queue/queueSlice'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { useFavorites } from '../favorites/useFavorites'
import { catalogGameGroupKey } from '../../shared/utils/normalizeTitleKey'
import { formatUserError } from '../../shared/utils/formatUserError'
import { useToast } from '../../shared/components/ToastProvider'
import type { CatalogGame, GetGameDetailInput } from '../../shared/types/contracts'
import { useDiscoverCatalog } from './useDiscoverCatalog'
import type { DiscoverControllerValue } from './DiscoverController'

type UseDiscoverControllerStateArgs = {
  onGoSettings: () => void
  onGoDownloads: () => void
}

export function useDiscoverControllerState({
  onGoSettings,
  onGoDownloads,
}: UseDiscoverControllerStateArgs): DiscoverControllerValue {
  const dispatch = useAppDispatch()
  const { showError } = useToast()
  const sources = useAppSelector((state) => state.sources.items)
  const sourcesLoading = useAppSelector((state) => state.sources.loading)
  const { defaultDownloadPath, disabledSourceIds } = useAppSettings()

  const [discoverSearchDraft, setDiscoverSearchDraft] = useState('')
  const [discoverSearch, setDiscoverSearch] = useState('')
  const [favoriteBusy, setFavoriteBusy] = useState(false)

  const enabledSourcesCount = useMemo(
    () => sources.filter((source) => !disabledSourceIds.includes(source.id)).length,
    [sources, disabledSourceIds],
  )

  const isSourceEnabled = useCallback(
    (sourceId: string) => !disabledSourceIds.includes(sourceId),
    [disabledSourceIds],
  )

  const submitDiscoverSearch = useCallback(() => {
    setDiscoverSearch(discoverSearchDraft.trim())
  }, [discoverSearchDraft])

  const applyDiscoverSearch = useCallback((query: string) => {
    const trimmed = query.trim()
    setDiscoverSearchDraft(trimmed)
    setDiscoverSearch(trimmed)
  }, [])

  const discover = useDiscoverCatalog({
    discoverSearch,
    enabledSourcesCount,
    defaultDownloadPath,
  })

  const favorites = useFavorites()

  const detailCatalogKey = useMemo(() => {
    const title = discover.gameDetail?.game.title ?? discover.selectedGame?.title
    return title ? catalogGameGroupKey(title) : ''
  }, [discover.gameDetail, discover.selectedGame])

  const detailIsFavorite = detailCatalogKey ? favorites.isFavorite(detailCatalogKey) : false

  const handleToggleDetailFavorite = useCallback(async () => {
    const title = discover.gameDetail?.game.title ?? discover.selectedGame?.title
    if (!title || !detailCatalogKey) return
    const coverUrl =
      discover.gameDetail?.game.coverUrl?.trim() ||
      discover.discoverPickGame?.coverUrl?.trim() ||
      discover.catalogGames.find((game) => game.title === title)?.coverUrl?.trim() ||
      null
    setFavoriteBusy(true)
    try {
      if (coverUrl) {
        await sourcesApi.saveGameCover(title, coverUrl)
      }
      await favorites.toggleFavorite(detailCatalogKey, title)
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Falha ao atualizar favorito.')
    } finally {
      setFavoriteBusy(false)
    }
  }, [detailCatalogKey, discover, favorites, showError])

  const coverCatalogGames = useMemo(() => {
    const games = discover.gameDetail?.game
      ? [...discover.catalogGames, discover.gameDetail.game]
      : [...discover.catalogGames]
    return games
  }, [discover.catalogGames, discover.gameDetail])

  const handleEnqueueFromDiscover = useCallback(
    async (title: string, url: string, coverUrl?: string | null) => {
      discover.setDiscoverBusy(url)
      try {
        const hasPath = defaultDownloadPath.trim().length > 0
        const fromDb = await sourcesApi.getDefaultDownloadPath()
        if (!hasPath && !fromDb) {
          showError('Defina a pasta padrão em Configurações antes de baixar.')
          return
        }
        const destPath = defaultDownloadPath.trim() || fromDb || undefined
        const resolvedCover = coverUrl ?? discover.discoverPickGame?.coverUrl ?? null
        await dispatch(
          enqueueJob({
            title,
            url,
            destPath: destPath ?? undefined,
            coverUrl: resolvedCover ?? undefined,
          }),
        ).unwrap()
        discover.closeDiscoverPicker()
        discover.closeGameDetail()
        onGoDownloads()
      } catch (error) {
        showError(formatUserError(error, 'Falha ao adicionar o download à fila.'))
      } finally {
        discover.setDiscoverBusy(null)
      }
    },
    [defaultDownloadPath, discover, dispatch, onGoDownloads, showError],
  )

  const openGameDetail = useCallback(
    (input: GetGameDetailInput | CatalogGame) => {
      if ('source' in input) {
        discover.openGameDetail({ title: input.title })
        return
      }
      discover.openGameDetail(input)
    },
    [discover],
  )

  return {
    view: discover.view,
    gameDetail: discover.gameDetail,
    detailLoading: discover.detailLoading,
    detailError: discover.detailError,
    isFavorite: detailIsFavorite,
    favoriteBusy,
    onToggleFavorite: () => void handleToggleDetailFavorite(),
    discoverSearch,
    discoverSearchDraft,
    setDiscoverSearchDraft,
    submitDiscoverSearch,
    applyDiscoverSearch,
    catalogLoading: discover.catalogLoading,
    catalogLoadingMore: discover.catalogLoadingMore,
    catalogHasMore: discover.catalogHasMore,
    loadMoreCatalog: discover.loadMoreCatalog,
    displayCatalogSource: discover.displayCatalogSource,
    discoverPickGame: discover.discoverPickGame,
    discoverPickLoading: discover.discoverPickLoading,
    discoverPickError: discover.discoverPickError,
    discoverPickOptions: discover.discoverPickOptions,
    discoverBusy: discover.discoverBusy,
    enabledSourcesCount,
    sources,
    sourcesLoading,
    isSourceEnabled,
    onGoSettings,
    openGameDetail,
    closeGameDetail: discover.closeGameDetail,
    closeDiscoverPicker: discover.closeDiscoverPicker,
    handleEnqueueFromDiscover,
    coverCatalogGames,
  }
}
