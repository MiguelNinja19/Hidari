import { type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { GameTileAction } from '../../shared/components/GameTileAction'
import { LibraryContextMenu } from './LibraryContextMenu'
import { LibraryGameCardCover } from './LibraryGameCardCover'
import { useLibraryCardMenu } from './useLibraryCardMenu'

type LibraryGameCardProps = {
  title: string
  titleAttr?: string
  metaLine?: string | null
  pendingActivity?: boolean
  isDeleting?: boolean
  cover: ReactNode
  showTitle?: boolean
  primaryAction?: GameTileAction | null
  secondaryActions?: GameTileAction[]
}

export function LibraryGameCard({
  title,
  titleAttr,
  metaLine,
  pendingActivity = false,
  isDeleting = false,
  cover,
  showTitle = false,
  primaryAction = null,
  secondaryActions = [],
}: LibraryGameCardProps) {
  const hasMenu = secondaryActions.length > 0
  const label = titleAttr ?? title
  const showProgress = pendingActivity || isDeleting
  const { menuOpen, menuPos, menuRef, menuId, openMenu, closeMenu } = useLibraryCardMenu(
    hasMenu,
    isDeleting,
  )

  const openContextMenu = (event: ReactMouseEvent) => {
    if (!hasMenu || isDeleting) return
    event.preventDefault()
    event.stopPropagation()
    openMenu(event.clientX, event.clientY)
  }

  const menuPanel =
    menuOpen && hasMenu && menuPos
      ? createPortal(
          <LibraryContextMenu
            menuRef={menuRef}
            menuId={menuId}
            left={menuPos.left}
            top={menuPos.top}
            actions={secondaryActions}
            isDeleting={isDeleting}
            onClose={closeMenu}
          />,
          document.body,
        )
      : null

  return (
    <article
      className={[
        'discover-card',
        'library-card',
        primaryAction ? 'library-card--actionable' : '',
        menuOpen ? 'library-card--menu-open' : '',
        pendingActivity ? 'library-card--pending' : '',
        isDeleting ? 'library-card--deleting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
      title={label}
      aria-busy={showProgress || undefined}
      onContextMenu={openContextMenu}
    >
      <LibraryGameCardCover
        cover={cover}
        title={title}
        showTitle={showTitle}
        metaLine={metaLine}
        showProgress={showProgress}
        primaryAction={primaryAction}
        isDeleting={isDeleting}
        onContextMenu={openContextMenu}
      />
      {menuPanel}
    </article>
  )
}
