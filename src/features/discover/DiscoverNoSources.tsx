import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../shared/components/EmptyState'

type DiscoverNoSourcesProps = {
  onGoSettings: () => void
}

export function DiscoverNoSources({ onGoSettings }: DiscoverNoSourcesProps) {
  const { t } = useTranslation()

  return (
    <EmptyState
      title={t('discover.noActiveSources')}
      action={{
        label: t('discover.openSettings'),
        onClick: onGoSettings,
      }}
    />
  )
}
