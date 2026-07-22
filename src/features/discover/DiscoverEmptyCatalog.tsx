import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../shared/components/EmptyState'

type DiscoverEmptyCatalogProps = {
  onGoSettings: () => void
}

export function DiscoverEmptyCatalog({ onGoSettings }: DiscoverEmptyCatalogProps) {
  const { t } = useTranslation()

  return (
    <EmptyState
      title={t('discover.emptyCatalogTitle')}
      description={t('discover.emptyCatalogDesc')}
      action={{
        label: t('discover.importCatalog'),
        onClick: onGoSettings,
      }}
    />
  )
}
