type EmptyStateAction = {
  label: string
  onClick: () => void
}

type EmptyStateProps = {
  title: string
  description?: string
  action?: EmptyStateAction
  secondaryAction?: EmptyStateAction
}

export function EmptyState({ title, description, action, secondaryAction }: EmptyStateProps) {
  const hasActions = Boolean(action || secondaryAction)

  return (
    <div className="empty-state">
      <div className="empty-state__bar" role="group" aria-label={title}>
        <h2 className="empty-state__title">{title}</h2>
        {hasActions ? (
          <div className="empty-state__actions">
            {action ? (
              <button className="empty-state__action" type="button" onClick={action.onClick}>
                {action.label}
              </button>
            ) : null}
            {secondaryAction ? (
              <button
                className="empty-state__action empty-state__action--secondary"
                type="button"
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {description ? <p className="empty-state__desc">{description}</p> : null}
    </div>
  )
}
