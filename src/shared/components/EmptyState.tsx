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
      <h2 className="empty-state__title">{title}</h2>
      {description ? <p className="empty-state__desc">{description}</p> : null}
      {hasActions ? (
        <div className="empty-state__actions">
          {action ? (
            <button
              className="btn btn-outline btn--compact"
              type="button"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ) : null}
          {secondaryAction ? (
            <button
              className="btn btn-outline btn--compact"
              type="button"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
