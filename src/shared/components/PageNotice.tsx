import { Loader } from './Loader'

type PageNoticeProps = {
  error?: string | null
  message?: string | null
  loading?: boolean
}

export function PageNotice({ error, message, loading }: PageNoticeProps) {
  if (error?.trim()) {
    return <p className="page-notice page-notice--error">{error.trim()}</p>
  }
  if (loading) {
    return (
      <div className="page-notice page-notice--loading">
        <Loader size="sm" />
        <span>Carregando…</span>
      </div>
    )
  }
  if (message?.trim()) {
    return <p className="page-notice">{message.trim()}</p>
  }
  return null
}
