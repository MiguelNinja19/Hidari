import { memo, type MouseEvent, type ReactNode } from 'react'
import { FavoriteHeartButton } from '../../shared/components/FavoriteHeartButton'

type DiscoverGameCardProps = {
  title: string
  titleAttr?: string
  genre: string
  cover: ReactNode
  /** Overlay só quando a capa não carrega (igual à Biblioteca). */
  showTitle?: boolean
  actionLabel: string
  onOpen: () => void
  favorite?: boolean
  favoriteBusy?: boolean
  onToggleFavorite?: () => void
}

export const DiscoverGameCard = memo(function DiscoverGameCard({
  title,
  titleAttr,
  genre: _genre,
  cover,
  showTitle = false,
  actionLabel,
  onOpen,
  favorite,
  favoriteBusy = false,
  onToggleFavorite,
}: DiscoverGameCardProps) {
  const label = titleAttr ?? title
  const hasFavorite = onToggleFavorite != null

  const handleFavoriteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onToggleFavorite?.()
  }

  return (
    <article
      className={`discover-card discover-card--explore library-card--actionable${hasFavorite ? ' discover-card--has-favorite' : ''}`}
      aria-label={label}
      title={label}
    >
      <div className="discover-card__panel">
        {hasFavorite ? (
          <div
            className={`discover-card__favorite-wrap${favorite ? ' discover-card__favorite-wrap--on' : ''}`}
          >
            <FavoriteHeartButton
              active={favorite ?? false}
              busy={favoriteBusy}
              size="card"
              onClick={handleFavoriteClick}
            />
          </div>
        ) : null}
        <button
          type="button"
          className="discover-card__cover-hitbox"
          onClick={onOpen}
          aria-label={actionLabel}
        >
          <div className="discover-card__cover">
            <div className="game-card discover-card__game-card">{cover}</div>
            {showTitle ? (
              <h3 className="discover-card__title discover-card__title--fallback" title={label}>
                {title}
              </h3>
            ) : null}
          </div>
        </button>
      </div>
    </article>
  )
})
