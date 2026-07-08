import { CatalogCover } from '../../shared/components/CatalogCover'
import { catalogGameDisplayTitle } from '../../shared/utils/normalizeTitleKey'
import { resolveDiscoverGenreDisplay } from '../../shared/utils/formatGenreLine'
import type { ResolvedCover } from '../covers/useGameCovers'

type FavoriteGameCardProps = {
  title: string
  genreLine: string
  coverUrl: string | null
  localPath: string | null
  coverStatus: ResolvedCover['status']
  priority?: boolean
  onOpen: () => void
  onLocalCoverError: () => void
}

function CtaArrow() {
  return (
    <span className="discover-card__cta-arrow" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
        <path
          d="M6 4.5 9.5 8 6 11.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export function FavoriteGameCard({
  title,
  genreLine,
  coverUrl,
  localPath,
  coverStatus,
  priority = false,
  onOpen,
  onLocalCoverError,
}: FavoriteGameCardProps) {
  const displayTitle = catalogGameDisplayTitle(title)
  const categories = resolveDiscoverGenreDisplay(genreLine)

  return (
    <article className="discover-card favorite-card" aria-label={displayTitle}>
      <button type="button" className="discover-card__title-btn" onClick={onOpen}>
        <h3 className="discover-card__title" title={displayTitle}>
          {displayTitle}
        </h3>
      </button>

      <div className="discover-card__panel">
        <button
          type="button"
          className="discover-card__cover-hitbox"
          onClick={onOpen}
          aria-label="Ver detalhes"
        >
          <div className="discover-card__cover">
            <div className="game-card discover-card__game-card">
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
        </button>

        <div className="discover-card__body">
          {categories ? (
            <p
              className="discover-card__meta"
              title={categories}
              aria-label={`Categorias: ${categories}`}
            >
              {categories}
            </p>
          ) : null}

          <button type="button" className="discover-card__cta" onClick={onOpen}>
            <span>Ver detalhes</span>
            <CtaArrow />
          </button>
        </div>
      </div>
    </article>
  )
}

export function FavoriteGameCardSkeleton() {
  return (
    <li className="favorites-grid__item">
      <article className="discover-card favorite-card discover-card--skeleton" aria-hidden="true">
        <div className="discover-card__title-skeleton shimmer" />
        <div className="discover-card__panel">
          <div className="discover-card__cover discover-card__cover--skeleton" />
          <div className="discover-card__body">
            <div className="discover-card__meta-skeleton shimmer" />
            <div className="discover-card__cta-skeleton shimmer" />
          </div>
        </div>
      </article>
    </li>
  )
}
