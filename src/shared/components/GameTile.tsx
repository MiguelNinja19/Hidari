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
  /** Biblioteca: card unificado com barra de ações integrada. */
  variant?: 'default' | 'library'
}

function LibraryDockButton({
  action,
  className,
}: {
  action: GameTileAction
  className: string
}) {
  return (
    <button
      type="button"
      className={className}
      title={action.title ?? action.label}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      {action.label}
    </button>
  )
}

function LibraryGameTile({
  title,
  titleAttr,
  cover,
  primaryAction,
  secondaryActions,
  statusLine,
  className,
}: Omit<GameTileProps, 'variant'>) {
  const hasActions = Boolean(primaryAction) || (secondaryActions?.length ?? 0) > 0

  return (
    <article
      className={`game-tile game-tile--library${className ? ` ${className}` : ''}`}
      aria-label={titleAttr ?? title}
    >
      <div className="game-tile__card">
        <div className="game-tile__cover-wrap">
          <div className="game-tile__cover">{cover}</div>
        </div>

        <div className="game-tile__body">
          <h3 className="game-tile__title" title={titleAttr ?? title}>
            {title}
          </h3>

          {statusLine ? <p className="game-tile__status">{statusLine}</p> : null}

          {hasActions ? (
            <div className="game-tile__dock">
              {primaryAction ? (
                <LibraryDockButton
                  action={primaryAction}
                  className={`game-tile__dock-primary${
                    primaryAction.variant === 'outline' ? ' game-tile__dock-primary--muted' : ''
                  }${
                    primaryAction.id === 'install' ? ' game-tile__dock-primary--install' : ''
                  }`}
                />
              ) : null}

              {(secondaryActions?.length ?? 0) > 0 ? (
                <div
                  className="game-tile__dock-tools"
                  role="group"
                  aria-label="Mais ações"
                  data-tool-count={secondaryActions!.length}
                >
                  {secondaryActions!.map((action) => (
                    <LibraryDockButton
                      key={action.id}
                      action={action}
                      className={`game-tile__dock-tool${
                        action.variant === 'danger' ? ' game-tile__dock-tool--danger' : ''
                      }`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export function GameTile({
  title,
  titleAttr,
  cover,
  primaryAction,
  secondaryActions = [],
  statusLine,
  className,
  variant = 'default',
}: GameTileProps) {
  if (variant === 'library') {
    return (
      <LibraryGameTile
        title={title}
        titleAttr={titleAttr}
        cover={cover}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        statusLine={statusLine}
        className={className}
      />
    )
  }

  const hasActions = Boolean(primaryAction) || secondaryActions.length > 0

  return (
    <article
      className={`game-tile${className ? ` ${className}` : ''}`}
      aria-label={titleAttr ?? title}
    >
      <div className="game-tile__cover-wrap">
        <div className="game-tile__cover">{cover}</div>
      </div>
      <h3 className="game-tile__title" title={titleAttr ?? title}>
        {title}
      </h3>
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
