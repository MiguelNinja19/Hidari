import type {
  HTMLAttributes,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react'

function stopSummaryToggle(event: ReactMouseEvent) {
  event.preventDefault()
  event.stopPropagation()
}

export function SettingsSection({
  id,
  title,
  description,
  actions,
  children,
  defaultOpen = true,
}: {
  id: string
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details
      id={id}
      className="set-card"
      {...({ defaultOpen } as HTMLAttributes<HTMLDetailsElement>)}
    >
      <summary className="set-card__summary">
        <div className="set-card__titles">
          <p className="set-card__label">{title}</p>
          <p className="set-card__desc">{description}</p>
        </div>
        {actions ? (
          <div className="set-card__actions" onClick={stopSummaryToggle}>
            {actions}
          </div>
        ) : null}
        <span className="set-card__chevron" aria-hidden />
      </summary>
      <div className="set-card__body">{children}</div>
    </details>
  )
}
