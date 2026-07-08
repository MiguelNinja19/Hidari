import type { ReactNode } from 'react'

type DiscoverGameCardProps = {
  title: string
  titleAttr?: string
  genre: string
  cover: ReactNode
  actionLabel: string
  onOpen: () => void
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

export function DiscoverGameCard({
  title,
  titleAttr,
  genre: _genre,
  cover,
  actionLabel,
  onOpen,
}: DiscoverGameCardProps) {
  const label = titleAttr ?? title

  return (
    <article className="discover-card discover-card--explore" aria-label={label}>
      <button type="button" className="discover-card__title-btn" onClick={onOpen}>
        <h3 className="discover-card__title" title={label}>
          {title}
        </h3>
      </button>

      <div className="discover-card__panel">
        <button
          type="button"
          className="discover-card__cover-hitbox"
          onClick={onOpen}
          aria-label={actionLabel}
        >
          <div className="discover-card__cover">
            <div className="game-card discover-card__game-card">{cover}</div>
          </div>
        </button>

        <div className="discover-card__body">
          <button type="button" className="discover-card__cta" onClick={onOpen}>
            <span>{actionLabel}</span>
            <CtaArrow />
          </button>
        </div>
      </div>
    </article>
  )
}

export function DiscoverGameCardSkeleton() {
  return (
    <li className="discover-grid__item">
      <article className="discover-card discover-card--skeleton" aria-hidden="true">
        <div className="discover-card__title-skeleton shimmer" />
        <div className="discover-card__panel">
          <div className="discover-card__cover discover-card__cover--skeleton" />
          <div className="discover-card__body">
            <div className="discover-card__cta-skeleton shimmer" />
          </div>
        </div>
      </article>
    </li>
  )
}
