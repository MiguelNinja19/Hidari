import { useTranslation } from 'react-i18next'
import { SearchInput } from '../../shared/components/ui/SearchInput'

type DiscoverToolbarProps = {
  value: string
  hasActiveSources: boolean
  loading: boolean
  onChange: (value: string) => void
  onSubmit: () => void
}

export function DiscoverToolbar({
  value,
  hasActiveSources,
  loading,
  onChange,
  onSubmit,
}: DiscoverToolbarProps) {
  const { t } = useTranslation()

  return (
    <header className="page-toolbar page-toolbar--discover">
      <div className="page-toolbar__search">
        <SearchInput
          value={value}
          searchFocusId="discover"
          className="browse-search browse-search--soft"
          inputClassName="browse-search__input"
          placeholder={
            hasActiveSources
              ? t('discover.searchPlaceholder')
              : t('discover.searchPlaceholderNoSources')
          }
          disabled={!hasActiveSources}
          onChange={onChange}
          onSubmit={onSubmit}
          trailing={
            <button
              type="button"
              className="browse-search__submit"
              disabled={!hasActiveSources || loading || value.trim().length < 2}
              onClick={onSubmit}
            >
              {loading ? t('discover.searching') : t('common.search')}
            </button>
          }
        />
      </div>
    </header>
  )
}
