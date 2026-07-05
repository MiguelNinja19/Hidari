import type { ReactNode } from 'react'
import { Button } from './ui/Button'

export type GameTileAction = {
  id: string
  label: string
  title?: string
  variant?: 'primary' | 'outline' | 'danger'
  disabled?: boolean
  onClick: () => void
}

type GameTileProps = {
  title: string
  titleAttr?: string
  cover: ReactNode
  primaryAction?: GameTileAction | null
  secondaryActions?: GameTileAction[]
  statusLine?: string | null
  className?: string
}

export function GameTile({
  title,
  titleAttr,
  cover,
  primaryAction,
  secondaryActions = [],
  statusLine,
  className,
}: GameTileProps) {
  const hasActions = Boolean(primaryAction) || secondaryActions.length > 0

  return (
    <article
      className={`game-tile${className ? ` ${className}` : ''}`}
      aria-label={titleAttr ?? title}
    >
      <div className="game-tile__cover-wrap">
        <div className="game-tile__cover">{cover}</div>
      </div>
      {hasActions ? (
        <div className="game-tile__actions">
          {primaryAction ? (
            <Button
              variant={primaryAction.variant ?? 'primary'}
              size="compact"
              className={`game-tile__cta${
                primaryAction.id === 'install' ? ' game-tile__cta--install' : ''
              }`}
              type="button"
              title={primaryAction.title}
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </Button>
          ) : null}
          {secondaryActions.length > 0 ? (
            <div className="game-tile__secondary" role="group" aria-label="Mais ações">
              {secondaryActions.map((action) => (
                <Button
                  key={action.id}
                  variant={action.variant ?? 'outline'}
                  size="compact"
                  className="game-tile__tool"
                  type="button"
                  title={action.title ?? action.label}
                  disabled={action.disabled}
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {statusLine ? (
        <div className="game-tile__foot">
          <p className="game-tile__status">{statusLine}</p>
        </div>
      ) : null}
    </article>
  )
}

type GameTileSkeletonProps = {
  className?: string
}

export function GameTileSkeleton({ className }: GameTileSkeletonProps) {
  return (
    <li className={`game-tile game-tile--skeleton${className ? ` ${className}` : ''}`}>
      <div className="game-tile__cover game-tile__cover--skeleton" />
    </li>
  )
}
