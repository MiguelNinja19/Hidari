import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import type { GameTileAction } from '../../shared/components/GameTileAction'

type LibraryGameCardProps = {
  title: string
  titleAttr?: string
  metaLine?: string | null
  cover: ReactNode
  /** Só mostrar o título quando a capa não está disponível. */
  showTitle?: boolean
  primaryAction?: GameTileAction | null
  secondaryActions?: GameTileAction[]
}

type MenuPosition = { left: number; top: number }

export function LibraryGameCard({
  title,
  titleAttr,
  metaLine,
  cover,
  showTitle = false,
  primaryAction = null,
  secondaryActions = [],
}: LibraryGameCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const hasMenu = secondaryActions.length > 0
  const label = titleAttr ?? title

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

    const onScroll = () => setMenuOpen(false)

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menuOpen])

  useLayoutEffect(() => {
    if (!menuOpen || !menuRef.current || !menuPos) return

    const panel = menuRef.current
    const rect = panel.getBoundingClientRect()
    const pad = 8
    let left = menuPos.left
    let top = menuPos.top

    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad)
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad)
    }
    if (left !== menuPos.left || top !== menuPos.top) {
      setMenuPos({ left, top })
    }
  }, [menuOpen, menuPos])

  const openContextMenu = (event: ReactMouseEvent) => {
    if (!hasMenu) return
    event.preventDefault()
    event.stopPropagation()
    setMenuPos({ left: event.clientX, top: event.clientY })
    setMenuOpen(true)
  }

  return (
    <article
      className={[
        'discover-card',
        'library-card',
        primaryAction ? 'library-card--actionable' : '',
        menuOpen ? 'library-card--menu-open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
      title={label}
      onContextMenu={openContextMenu}
    >
      <div className="discover-card__panel">
        {primaryAction ? (
          <button
            type="button"
            className="discover-card__cover-hitbox"
            title={primaryAction.title}
            disabled={primaryAction.disabled}
            onClick={primaryAction.onClick}
            onContextMenu={openContextMenu}
            aria-label={primaryAction.label}
          >
            <div className="discover-card__cover">
              <div className="game-card discover-card__game-card">{cover}</div>
              {showTitle ? (
                <h3 className="discover-card__title discover-card__title--fallback">{title}</h3>
              ) : null}
              {metaLine ? <span className="discover-card__badge">{metaLine}</span> : null}
            </div>
          </button>
        ) : (
          <div className="discover-card__cover">
            <div className="game-card discover-card__game-card">{cover}</div>
            {showTitle ? (
              <h3 className="discover-card__title discover-card__title--fallback">{title}</h3>
            ) : null}
            {metaLine ? <span className="discover-card__badge">{metaLine}</span> : null}
          </div>
        )}
      </div>

      {menuOpen && hasMenu && menuPos ? (
        <div
          ref={menuRef}
          className="library-card__menu-panel library-card__menu-panel--context"
          id={menuId}
          role="menu"
          style={{ left: menuPos.left, top: menuPos.top }}
        >
          {secondaryActions.map((action, index) => {
            const prev = secondaryActions[index - 1]
            const showDivider =
              index > 0 &&
              ((prev?.variant === 'primary' && action.variant !== 'primary') ||
                action.variant === 'danger')

            return (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                className={[
                  'library-card__menu-item',
                  showDivider ? 'library-card__menu-item--divided' : '',
                  action.variant === 'danger' ? 'library-card__menu-item--danger' : '',
                  action.variant === 'primary' ? 'library-card__menu-item--primary' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={action.title ?? action.label}
                disabled={action.disabled}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setMenuOpen(false)
                  action.onClick()
                }}
              >
                {action.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </article>
  )
}
