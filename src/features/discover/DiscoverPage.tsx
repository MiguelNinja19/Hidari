import { useCallback } from 'react'
import { DiscoverGameDetailPage } from './DiscoverGameDetailPage'
import { useFavoriteCatalog } from '../favorites/FavoriteCatalogProvider'
import { useDiscoverController } from './DiscoverController'
import { DiscoverBrowsePage } from './DiscoverBrowsePage'

export function DiscoverPage() {
  const {
    discoverPickGame,
    discoverPickLoading,
    discoverPickError,
    discoverPickOptions,
    discoverPickSynopsis,
    discoverPickScreenshots,
    discoverBusy,
    closeDiscoverPicker,
    handleEnqueueFromDiscover,
  } = useDiscoverController()
  const favoriteCatalog = useFavoriteCatalog()
  const detailFavorite = discoverPickGame ? favoriteCatalog.isFavorite(discoverPickGame) : false
  const detailFavoriteBusy = discoverPickGame ? favoriteCatalog.isBusy(discoverPickGame) : false
  const handleToggleDetailFavorite = useCallback(async () => {
    if (!discoverPickGame || detailFavoriteBusy) return
    await favoriteCatalog.toggleFavorite(discoverPickGame)
  }, [detailFavoriteBusy, discoverPickGame, favoriteCatalog])

  if (discoverPickGame) {
    return (
      <DiscoverGameDetailPage
        game={discoverPickGame}
        loading={discoverPickLoading}
        error={discoverPickError}
        options={discoverPickOptions}
        synopsis={discoverPickSynopsis}
        screenshots={discoverPickScreenshots}
        busyUrl={discoverBusy}
        favorite={detailFavorite}
        favoriteBusy={detailFavoriteBusy}
        onToggleFavorite={() => void handleToggleDetailFavorite()}
        onBack={closeDiscoverPicker}
        onDownload={handleEnqueueFromDiscover}
      />
    )
  }

  return <DiscoverBrowsePage />
}
