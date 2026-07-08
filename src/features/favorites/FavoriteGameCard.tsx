import { CatalogCover } from '../../shared/components/CatalogCover'
import { catalogGameDisplayTitle } from '../../shared/utils/normalizeTitleKey'
import { formatGenreParts, isLikelyGameGenre, splitGenreParts } from '../../shared/utils/formatGenreLine'
import type { ResolvedCover } from '../covers/useGameCovers'

type FavoriteGameCardProps = {
  title: string
  genreLine: string
  badge?: string | null
  coverUrl: string | null
  localPath: string | null
  coverStatus: ResolvedCover['status']
  priority?: boolean
  onOpen: () => void
  onLocalCoverError: () => void
}

export function FavoriteGameCard({
  title,
  genreLine,
  badge = 'Favorito',
  coverUrl,
  localPath,
  coverStatus,
  priority = false,
  onOpen,
  onLocalCoverError,
}: FavoriteGameCardProps) {
  const displayTitle = catalogGameDisplayTitle(title)
  const genreDisplay = isLikelyGameGenre(genreLine) ? formatGenreParts(genreLine) : ''
  const genres = splitGenreParts(genreLine)

  return (
    <article className="favorite-card">
      <h3 className="favorite-card__title" title={displayTitle}>
        {displayTitle}
      </h3>

      <div className="favorite-card__panel">
        <div className="favorite-card__cover">
          {badge ? <span className="favorite-card__badge">{badge}</span> : null}
          <div className="game-card favorite-card__game-card">
            <CatalogCover
              title={title}
              coverUrl={coverUrl}
              localPath={localPath}
              cached={Boolean(localPath)}
              status={coverStatus}
              priority={priority}
              onLocalCoverError={onLocalCoverError}
            />
          </div>
        </div>

        <div className="favorite-card__body">
          {genreDisplay ? (
            <p
              className="favorite-card__genres"
              title={genreDisplay}
              aria-label={`Géneros: ${genres.join(', ')}`}
            >
              {genreDisplay}
            </p>
          ) : null}

          <button type="button" className="favorite-card__cta" onClick={onOpen}>
            <span>Ver detalhes</span>
            <span className="favorite-card__cta-arrow" aria-hidden="true">
              →
            </span>
          </button>
        </div>
      </div>
    </article>
  )
}

export function FavoriteGameCardSkeleton() {
  return (
    <li className="favorites-grid__item">
      <article className="favorite-card favorite-card--skeleton" aria-hidden="true">
        <div className="favorite-card__title-skeleton shimmer" />
        <div className="favorite-card__panel">
          <div className="favorite-card__cover favorite-card__cover--skeleton" />
          <div className="favorite-card__body">
            <div className="favorite-card__genres-skeleton shimmer" />
            <div className="favorite-card__cta-skeleton shimmer" />
          </div>
        </div>
      </article>
    </li>
  )
}
