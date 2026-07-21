import { useTranslation } from 'react-i18next'
import type { CatalogGame } from '../../shared/types/contracts'
import { VirtualizedCatalogGrid } from '../discover/VirtualizedCatalogGrid'

type Props = {
  loading: boolean
  games: CatalogGame[]
  isFavorite: (game: CatalogGame) => boolean
  isBusy: (game: CatalogGame) => boolean
  onOpen: (game: CatalogGame) => void
  onToggle: (game: CatalogGame) => void
}

export function FavoritesGrid({ loading, games, isFavorite, isBusy, onOpen, onToggle }: Props) {
  const { t } = useTranslation()
  return (
    <section className="browse-page">
      {loading ? (
        <ul className="discover-grid discover-grid--skeleton" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => (
            <li key={index} className="discover-grid__item">
              <article className="discover-card discover-card--explore discover-card--skeleton">
                <div className="discover-card__panel">
                  <div className="discover-card__cover--skeleton skeleton-pulse" />
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : null}
      {!loading && games.length === 0 ? (
        <div className="favorites-empty" role="status">
          <p className="favorites-empty__label">{t('favorites.empty')}</p>
        </div>
      ) : null}
      {!loading && games.length > 0 ? (
        <VirtualizedCatalogGrid
          games={games}
          ariaLabel={t('nav.favorites')}
          isFavorite={isFavorite}
          isFavoriteBusy={isBusy}
          onOpen={onOpen}
          onToggleFavorite={onToggle}
        />
      ) : null}
    </section>
  )
}
