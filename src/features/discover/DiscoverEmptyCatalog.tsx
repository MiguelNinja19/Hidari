import { useTranslation } from 'react-i18next'

type DiscoverEmptyCatalogProps = {
  onGoSettings: () => void
}

export function DiscoverEmptyCatalog({ onGoSettings }: DiscoverEmptyCatalogProps) {
  const { t } = useTranslation()

  return (
    <div className="discover-setup-wrap">
      <div className="discover-setup discover-setup--warn">
        <h2 className="discover-setup__title">{t('discover.emptyCatalogTitle')}</h2>
        <p className="discover-setup__text">{t('discover.emptyCatalogDesc')}</p>
        <button className="btn btn-primary discover-setup__action" type="button" onClick={onGoSettings}>
          {t('discover.importCatalog')}
        </button>
      </div>
    </div>
  )
}
