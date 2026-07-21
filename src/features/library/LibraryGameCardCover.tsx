import type { ReactNode, MouseEvent as ReactMouseEvent } from 'react'
import type { GameTileAction } from '../../shared/components/GameTileAction'

type LibraryGameCardCoverProps = {
  cover: ReactNode
  title: string
  showTitle: boolean
  metaLine?: string | null
  showProgress: boolean
  primaryAction?: GameTileAction | null
  isDeleting: boolean
  onContextMenu: (event: ReactMouseEvent) => void
}

export function LibraryGameCardCover({
  cover,
  title,
  showTitle,
  metaLine,
  showProgress,
  primaryAction,
  isDeleting,
  onContextMenu,
}: LibraryGameCardCoverProps) {
  const body = (
    <div className="discover-card__cover">
      <div className="game-card discover-card__game-card">{cover}</div>
      {showTitle ? (
        <h3 className="discover-card__title discover-card__title--fallback">{title}</h3>
      ) : null}
      {metaLine ? <span className="discover-card__badge">{metaLine}</span> : null}
      {showProgress ? (
        <div className="library-card__progress" aria-hidden>
          <span className="library-card__progress-fill" />
        </div>
      ) : null}
    </div>
  )

  if (!primaryAction) {
    return <div className="discover-card__panel">{body}</div>
  }

  return (
    <div className="discover-card__panel">
      <button
        type="button"
        className="discover-card__cover-hitbox"
        title={primaryAction.title}
        disabled={primaryAction.disabled || isDeleting}
        onClick={primaryAction.onClick}
        onContextMenu={onContextMenu}
        aria-label={primaryAction.label}
      >
        {body}
      </button>
    </div>
  )
}
