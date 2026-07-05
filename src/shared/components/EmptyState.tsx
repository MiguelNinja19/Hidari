type EmptyStateAction = {
  label: string
  onClick: () => void
}

type EmptyStateProps = {
  title: string
  description?: string
  action?: EmptyStateAction
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M9 9h6M9 13h4" />
        </svg>
      </div>
      <h2 className="empty-state__title">{title}</h2>
      {description ? <p className="empty-state__desc">{description}</p> : null}
      {action ? (
        <button className="btn btn-primary empty-state__action" type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
