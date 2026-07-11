import { useTranslation } from 'react-i18next'

type DiscoverNoSourcesProps = {
  onGoSettings: () => void
}

export function DiscoverNoSources({ onGoSettings }: DiscoverNoSourcesProps) {
  const { t } = useTranslation()

  return (
    <div className="discover-setup-wrap">
      <div className="discover-setup">
        <h2 className="discover-setup__title">{t('discover.noActiveSources')}</h2>
        <p className="discover-setup__text">
          {t('discover.enableSourcesHint')}{' '}
          <button type="button" className="discover-setup__link" onClick={onGoSettings}>
            {t('discover.goToSettings')}
          </button>
        </p>
      </div>
    </div>
  )
}
