import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { useAppSettings } from '../../app/context/AppSettingsContext'
import { useToast } from '../../shared/components/ToastProvider'
import type { CatalogGame, GetGameDetailInput } from '../../shared/types/contracts'
import { useDiscoverCatalog } from './useDiscoverCatalog'
import type { DiscoverControllerValue } from './DiscoverController'
import { useDiscoverEnqueue } from './useDiscoverEnqueue'
import { useDiscoverSources } from './useDiscoverSources'
import type { UseDiscoverControllerStateArgs } from './discoverControllerStateTypes'

export function useDiscoverControllerState({
  onGoSettings,
  onGoDownloads,
}: UseDiscoverControllerStateArgs): DiscoverControllerValue {
  const dispatch = useAppDispatch()
  const { showError } = useToast()
  const { t } = useTranslation()
  const sources = useAppSelector((state) => state.sources.items)
  const sourcesLoading = useAppSelector((state) => state.sources.loading)
  const { defaultDownloadPath, disabledSourceIds, disabledSourcesReady } = useAppSettings()

  const [discoverSearchDraft, setDiscoverSearchDraft] = useState('')
  const [discoverSearch, setDiscoverSearch] = useState('')
  const [discoverGridColumns, setDiscoverGridColumnsState] = useState(5)

  const setDiscoverGridColumns = useCallback((columns: number) => {
    const next = Math.max(1, Math.min(12, Math.floor(columns) || 5))
    setDiscoverGridColumnsState((prev) => (prev === next ? prev : next))
  }, [])

  const { enabledSourcesCount, enabledSourcesKey, isSourceEnabled } =
    useDiscoverSources(sources, disabledSourceIds, disabledSourcesReady)

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
    enabledSourcesKey,
    defaultDownloadPath,
    gridColumns: discoverGridColumns,
  })

  const handleEnqueueFromDiscover = useDiscoverEnqueue(
    discover,
    defaultDownloadPath,
    dispatch,
    onGoDownloads,
    showError,
    t,
  )

  const openGameDetail = useCallback(
    (input: GetGameDetailInput | CatalogGame) => {
      discover.openGameDetail(input)
    },
    [discover],
  )

  return {
    discoverSearch,
    discoverSearchDraft,
    setDiscoverSearchDraft,
    submitDiscoverSearch,
    applyDiscoverSearch,
    catalogLoading: discover.catalogLoading,
    catalogLoadingMore: discover.catalogLoadingMore,
    catalogHasMore: discover.catalogHasMore,
    loadMoreCatalog: discover.loadMoreCatalog,
    setDiscoverGridColumns,
    displayCatalogSource: discover.displayCatalogSource,
    discoverPickGame: discover.discoverPickGame,
    discoverPickLoading: discover.discoverPickLoading,
    discoverPickError: discover.discoverPickError,
    discoverPickOptions: discover.discoverPickOptions,
    discoverPickSynopsis: discover.discoverPickSynopsis,
    discoverPickScreenshots: discover.discoverPickScreenshots,
    discoverBusy: discover.discoverBusy,
    enabledSourcesCount,
    sources,
    sourcesLoading: sourcesLoading || !disabledSourcesReady,
    isSourceEnabled,
    onGoSettings,
    openGameDetail,
    closeDiscoverPicker: discover.closeDiscoverPicker,
    handleEnqueueFromDiscover,
    coverCatalogGames: discover.catalogGames,
  }
}
