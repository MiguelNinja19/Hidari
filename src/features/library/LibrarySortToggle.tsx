import { useTranslation } from 'react-i18next'
import type { LibrarySort } from '../../shared/config/appSettings'

type LibrarySortToggleProps = {
  value: LibrarySort
  onChange: (value: LibrarySort) => void
}

const OPTIONS: LibrarySort[] = ['title-asc', 'title-desc', 'recent']

const LABEL_KEY: Record<
  LibrarySort,
  'library.sortTitleAsc' | 'library.sortTitleDesc' | 'library.sortRecent'
> = {
  'title-asc': 'library.sortTitleAsc',
  'title-desc': 'library.sortTitleDesc',
  recent: 'library.sortRecent',
}

export function LibrarySortToggle({ value, onChange }: LibrarySortToggleProps) {
  const { t } = useTranslation()

  return (
    <div className="library-sort-toggle" role="group" aria-label={t('library.sortAriaLabel')}>
      {OPTIONS.map((option) => {
        const active = value === option
        return (
          <button
            key={option}
            type="button"
            className={`library-sort-toggle__btn${active ? ' library-sort-toggle__btn--active' : ''}`}
            aria-pressed={active}
            onClick={() => onChange(option)}
          >
            {t(LABEL_KEY[option])}
          </button>
        )
      })}
    </div>
  )
}
