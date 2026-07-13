import { useTranslation } from 'react-i18next'

type DiscoverNoResultsProps = {
  query: string
}

export function DiscoverNoResults({ query }: DiscoverNoResultsProps) {
  const { t } = useTranslation()

  return (
    <div className="discover-empty" role="status">
      <h2 className="discover-empty__title">
        {t('discover.noResultsTitleForQuery', { query })}
      </h2>
      <p className="discover-empty__desc">{t('discover.noResultsHint')}</p>
    </div>
  )
}
