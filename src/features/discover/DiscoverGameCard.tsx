import type { ReactNode } from 'react'

type DiscoverGameCardProps = {
  title: string
  titleAttr?: string
  genre: string
  cover: ReactNode
  /** Overlay só quando a capa ainda não existe. */
  showTitle?: boolean
  actionLabel: string
  onOpen: () => void
}

export function DiscoverGameCard({
  title,
  titleAttr,
  genre: _genre,
  cover,
  showTitle = false,
  actionLabel,
  onOpen,
}: DiscoverGameCardProps) {
  const label = titleAttr ?? title

  return (
    <article
      className="discover-card discover-card--explore library-card--actionable"
      aria-label={label}
      title={label}
    >
      <div className="discover-card__panel">
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
      {/* Título sob o poster — melhora a leitura na grelha de pesquisa. */}
      {!showTitle ? (
        <button
          type="button"
          className="discover-card__title-btn"
          onClick={onOpen}
          title={label}
        >
          <h3 className="discover-card__title discover-card__title--under" title={label}>
            {title}
          </h3>
        </button>
      ) : null}
    </article>
  )
}
