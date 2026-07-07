type PageNoticeProps = {
  error?: string | null
  message?: string | null
}

export function PageNotice({ error, message }: PageNoticeProps) {
  if (error?.trim()) {
    return <p className="page-notice page-notice--error">{error.trim()}</p>
  }
  if (message?.trim()) {
    return <p className="page-notice">{message.trim()}</p>
  }
  return null
}
