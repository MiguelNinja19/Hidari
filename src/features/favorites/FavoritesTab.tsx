import { useTranslation } from 'react-i18next'
import { useAppSettings } from '../../app/context/AppSettingsContext'
import { useNavigation } from '../../app/context/NavigationContext'
import { CoversProvider, useCovers } from '../covers/CoversProvider'
import { DiscoverGameDetailPage } from '../discover/DiscoverGameDetailPage'
import { useToast } from '../../shared/components/ToastProvider'
import { useFavoriteCatalog } from './FavoriteCatalogProvider'
import { FavoritesGrid } from './FavoritesGrid'
import { useFavoritesPage } from './useFavoritesPage'

function FavoritesPageInner({ active }: { active: boolean }) {
  const { t } = useTranslation()
  const { defaultDownloadPath } = useAppSettings()
  const { navigateDownloads } = useNavigation()
  const { showError } = useToast()
  const { resolveCoversBatch } = useCovers()
  const {
    refresh: refreshFavoriteIndex,
    isFavorite,
    isBusy,
    toggleFavorite,
  } = useFavoriteCatalog()

  const page = useFavoritesPage({
    active, defaultDownloadPath, navigateDownloads, showError,
    refreshFavoriteIndex, isBusy, toggleFavorite, resolveCoversBatch, t,
  })

  if (page.detail) {
    return (
      <DiscoverGameDetailPage
        game={page.detail.game}
        loading={page.detail.loading}
        error={page.detail.error}
        options={page.detail.options}
        synopsis={page.detail.synopsis}
        screenshots={page.detail.screenshots}
        busyUrl={page.detail.busyUrl}
        favorite={isFavorite(page.detail.game)}
        favoriteBusy={isBusy(page.detail.game)}
        onToggleFavorite={() => void page.toggle(page.detail!.game, true)}
        onBack={page.closeDetail}
        onDownload={page.download}
      />
    )
  }
  return <FavoritesGrid
    loading={page.loading}
    games={page.games}
    isFavorite={isFavorite}
    isBusy={isBusy}
    onOpen={page.openGame}
    onToggle={(game) => void page.toggle(game)}
  />
}

export function FavoritesTab() {
  const { activeTab } = useNavigation()
  return (
    <CoversProvider catalogGames={[]} eager>
      <FavoritesPageInner active={activeTab === 'favorites'} />
    </CoversProvider>
  )
}
