import { useTranslation } from 'react-i18next'

type DownloadsPageHeaderProps = {
  summary: string
  showHeaderActions: boolean
  canResumeAll: boolean
  canPauseAll: boolean
  canClearCompleted: boolean
  actionBusyId: string | null
  onResumeAll: () => Promise<void>
  onPauseAll: () => Promise<void>
  onClearCompleted: () => Promise<void>
}

export function DownloadsPageHeader({
  summary,
  showHeaderActions,
  canResumeAll,
  canPauseAll,
  canClearCompleted,
  actionBusyId,
  onResumeAll,
  onPauseAll,
  onClearCompleted,
}: DownloadsPageHeaderProps) {
  const { t } = useTranslation()
  return (
    <header className="dl-page__head">
      <div className="dl-page__titles">
        <p className="dl-page__label">{t('nav.downloads')}</p>
        <p className="dl-page__desc">{summary}</p>
      </div>
      {showHeaderActions ? (
        <div className="dl-page__actions">
          {canResumeAll ? (
            <button
              type="button"
              className="set-btn set-btn--secondary"
              disabled={actionBusyId === '__all__'}
              onClick={() => void onResumeAll()}
            >
              {t('downloads.resumeAll')}
            </button>
          ) : null}
          {canPauseAll ? (
            <button
              type="button"
              className="set-btn set-btn--secondary"
              disabled={actionBusyId === '__all__'}
              onClick={() => void onPauseAll()}
            >
              {t('downloads.pauseAll')}
            </button>
          ) : null}
          {canClearCompleted ? (
            <button type="button" className="set-btn set-btn--secondary" onClick={() => void onClearCompleted()}>
              {t('downloads.clearCompleted')}
            </button>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}
