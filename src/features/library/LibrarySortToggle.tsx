import { useTranslation } from 'react-i18next'
import type { LibrarySort } from '../../shared/config/appSettings'

type LibrarySortToggleProps = {
  value: LibrarySort
  onChange: (value: LibrarySort) => void
}

const OPTIONS: LibrarySort[] = ['title-asc', 'title-desc']

const LABEL_KEY: Record<LibrarySort, 'library.sortTitleAsc' | 'library.sortTitleDesc'> = {
  'title-asc': 'library.sortTitleAsc',
  'title-desc': 'library.sortTitleDesc',
}

export function LibrarySortToggle({ value, onChange }: LibrarySortToggleProps) {
  const { t } = useTranslation()

  return (
    <div className="library-sort-toggle" role="group" aria-label="Ordenar biblioteca">
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
