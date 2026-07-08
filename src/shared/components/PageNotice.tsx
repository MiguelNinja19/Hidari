import { InlineAlert } from './InlineAlert'

type PageNoticeProps = {
  error?: string | null
  message?: string | null
  onDismiss?: () => void
  className?: string
}

export function PageNotice({ error, message, onDismiss, className }: PageNoticeProps) {
  if (error?.trim()) {
    return (
      <InlineAlert variant="error" onDismiss={onDismiss} className={className}>
        {error.trim()}
      </InlineAlert>
    )
  }
  if (message?.trim()) {
    return (
      <InlineAlert variant="info" onDismiss={onDismiss} className={className}>
        {message.trim()}
      </InlineAlert>
    )
  }
  return null
}
