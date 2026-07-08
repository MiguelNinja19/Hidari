import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
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
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const hasMenu = secondaryActions.length > 0

  const showArrow =
    primaryAction?.id === 'play' ||
    primaryAction?.id === 'install' ||
    primaryAction?.id === 'queue' ||
    primaryAction?.id === 'resume' ||
    primaryAction?.id === 'locate-primary'

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <article className="discover-card library-card" aria-label={titleAttr ?? title}>
      <h3 className="discover-card__title" title={titleAttr ?? title}>
        {title}
      </h3>

      <div className="discover-card__panel">
        <div className="discover-card__cover">
          <div className="game-card discover-card__game-card">{cover}</div>
        </div>

        {hasMenu ? (
          <div
            className={`library-card__menu${menuOpen ? ' library-card__menu--open' : ''}`}
            ref={menuRef}
          >
            <button
              type="button"
              className="library-card__menu-trigger"
              aria-label="Mais opções"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span aria-hidden="true">⋯</span>
            </button>

            {menuOpen ? (
              <div className="library-card__menu-panel" id={menuId} role="menu">
                {secondaryActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    className={`library-card__menu-item${
                      action.variant === 'danger' ? ' library-card__menu-item--danger' : ''
                    }`}
                    title={action.title ?? action.label}
                    disabled={action.disabled}
                    onClick={() => {
                      setMenuOpen(false)
                      action.onClick()
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="discover-card__body">
          {metaLine ? (
            <p className="discover-card__meta library-card__status" title={metaLine}>
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
              ) : null}
            </button>
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
