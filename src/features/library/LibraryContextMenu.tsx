import type { ReactNode, RefObject } from 'react'
import type { GameTileAction } from '../../shared/components/GameTileAction'

type LibraryContextMenuProps = {
  menuRef: RefObject<HTMLDivElement | null>
  menuId: string
  left: number
  top: number
  actions: GameTileAction[]
  isDeleting: boolean
  onClose: () => void
}

export function LibraryContextMenu({
  menuRef,
  menuId,
  left,
  top,
  actions,
  isDeleting,
  onClose,
}: LibraryContextMenuProps): ReactNode {
  return (
    <div
      ref={menuRef}
      className="library-card__menu-panel library-card__menu-panel--context"
      id={menuId}
      role="menu"
      style={{ left, top }}
    >
      {actions.map((action, index) => {
        const prev = actions[index - 1]
        const showDivider =
          index > 0 &&
          ((prev?.variant === 'primary' && action.variant !== 'primary') ||
            action.variant === 'danger')

        return (
          <div key={action.id} className="library-card__menu-block">
            {showDivider ? <div className="library-card__menu-sep" role="separator" /> : null}
            <button
              type="button"
              role="menuitem"
              className={[
                'library-card__menu-item',
                action.variant === 'danger' ? 'library-card__menu-item--danger' : '',
                action.variant === 'primary' ? 'library-card__menu-item--primary' : '',
                action.variant === 'outline' ? 'library-card__menu-item--quiet' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={action.title ?? action.label}
              disabled={action.disabled || isDeleting}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onClose()
                action.onClick()
              }}
            >
              <span className="library-card__menu-item-label">{action.label}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
