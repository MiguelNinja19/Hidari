type InlineAlertVariant = 'error' | 'warning' | 'info'

type InlineAlertProps = {
  variant?: InlineAlertVariant
  title?: string
  children: string
  onDismiss?: () => void
  className?: string
}

const DEFAULT_TITLES: Record<InlineAlertVariant, string> = {
  error: 'Não foi possível concluir',
  warning: 'Atenção',
  info: 'Informação',
}

function AlertIcon({ variant }: { variant: InlineAlertVariant }) {
  if (variant === 'error') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" />
      </svg>
    )
  }
  if (variant === 'warning') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4l9 16H3L12 4z" />
        <path d="M12 10v4M12 17h.01" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  )
}

export function InlineAlert({
  variant = 'error',
  title,
  children,
  onDismiss,
  className,
}: InlineAlertProps) {
  const message = children.trim()
  if (!message) return null

  const heading = title?.trim() || DEFAULT_TITLES[variant]

  return (
    <div
      className={`inline-alert inline-alert--${variant}${className ? ` ${className}` : ''}`}
      role="alert"
      aria-live="polite"
    >
      <span className="inline-alert__icon" aria-hidden="true">
        <AlertIcon variant={variant} />
      </span>
      <div className="inline-alert__body">
        <p className="inline-alert__title">{heading}</p>
        <p className="inline-alert__message">{message}</p>
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="inline-alert__dismiss"
          aria-label="Fechar aviso"
          onClick={onDismiss}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
