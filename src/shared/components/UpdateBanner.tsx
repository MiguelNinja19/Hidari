import { useTranslation } from 'react-i18next'

type UpdateBannerProps = {
  version: string | null
  installing: boolean
  onInstall: () => void
  onDismiss: () => void
}

export function UpdateBanner({ version, installing, onInstall, onDismiss }: UpdateBannerProps) {
  const { t } = useTranslation()
  const label = version
    ? t('updater.availableWithVersion', { version })
    : t('updater.available')

  return (
    <div className="update-banner" role="status">
      <p className="update-banner__text">{label}</p>
      <div className="update-banner__actions">
        <button
          type="button"
          className="update-banner__btn update-banner__btn--primary"
          disabled={installing}
          onClick={onInstall}
        >
          {installing ? t('updater.installing') : t('updater.install')}
        </button>
        <button
          type="button"
          className="update-banner__btn update-banner__btn--ghost"
          disabled={installing}
          onClick={onDismiss}
        >
          {t('updater.later')}
        </button>
      </div>
    </div>
  )
}
