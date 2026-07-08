import type { ReactNode } from 'react'
import type { GameTileAction } from '../../shared/components/GameTile'

type LibraryGameCardProps = {
  title: string
  titleAttr?: string
  metaLine?: string | null
  cover: ReactNode
  primaryAction?: GameTileAction | null
  secondaryActions?: GameTileAction[]
}

export function LibraryGameCard({
  title,
  titleAttr,
  metaLine,
  cover,
  primaryAction = null,
  secondaryActions = [],
}: LibraryGameCardProps) {
  const showArrow =
    primaryAction?.id === 'play' ||
    primaryAction?.id === 'install' ||
    primaryAction?.id === 'queue' ||
    primaryAction?.id === 'resume' ||
    primaryAction?.id === 'locate-primary'

  return (
    <article className="discover-card library-card" aria-label={titleAttr ?? title}>
      <h3 className="discover-card__title" title={titleAttr ?? title}>
        {title}
      </h3>

      <div className="discover-card__panel">
        <div className="discover-card__cover">
          <div className="game-card discover-card__game-card">{cover}</div>
        </div>

        <div className="discover-card__body">
          {metaLine ? (
            <p className="discover-card__meta" title={metaLine}>
              {metaLine}
            </p>
          ) : null}

          {primaryAction ? (
            <button
              type="button"
              className={`discover-card__cta${
                primaryAction.id === 'install' ? ' library-card__cta--install' : ''
              }`}
              title={primaryAction.title}
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
            >
              <span>{primaryAction.label}</span>
              {showArrow ? (
                <span className="discover-card__cta-arrow" aria-hidden="true">
                  →
                </span>
              ) : null}
            </button>
          ) : null}

          {secondaryActions.length > 0 ? (
            <div
              className="library-card__dock"
              role="group"
              aria-label="Mais ações"
              data-tool-count={secondaryActions.length}
            >
              {secondaryActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={`library-card__dock-tool${
                    action.variant === 'danger' ? ' library-card__dock-tool--danger' : ''
                  }`}
                  title={action.title ?? action.label}
                  disabled={action.disabled}
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export function LibraryGameCardSkeleton() {
  return (
    <li className="library-grid__item">
      <article className="discover-card library-card discover-card--skeleton" aria-hidden="true">
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
