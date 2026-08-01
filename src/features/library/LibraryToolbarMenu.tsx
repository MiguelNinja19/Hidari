import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LibrarySort } from '../../shared/config/appSettings'

type LibraryToolbarMenuProps = {
  sort: LibrarySort
  onSortChange: (value: LibrarySort) => void
  onImportGame: () => void
  onImportSteam?: () => void
}

const SORT_OPTIONS: LibrarySort[] = ['title-asc', 'title-desc']

const SORT_LABEL_KEY: Record<LibrarySort, 'library.sortTitleAsc' | 'library.sortTitleDesc'> = {
  'title-asc': 'library.sortTitleAsc',
  'title-desc': 'library.sortTitleDesc',
}

export function LibraryToolbarMenu({
  sort,
  onSortChange,
  onImportGame,
  onImportSteam,
}: LibraryToolbarMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="library-toolbar__tools">
      <div className="library-toolbar-menu" ref={rootRef}>
        <button
          type="button"
          className={`library-toolbar-menu__trigger${open ? ' library-toolbar-menu__trigger--open' : ''}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={t('library.sortAriaLabel')}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="library-toolbar-menu__value">{t(SORT_LABEL_KEY[sort])}</span>
          <span className="library-toolbar-menu__caret" aria-hidden="true" />
        </button>
        {open ? (
          <div className="library-toolbar-menu__panel" id={menuId} role="menu">
            {SORT_OPTIONS.map((option) => {
              const active = sort === option
              return (
                <button
                  key={option}
                  type="button"
                  className={`library-toolbar-menu__item${active ? ' library-toolbar-menu__item--active' : ''}`}
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    onSortChange(option)
                    setOpen(false)
                  }}
                >
                  {t(SORT_LABEL_KEY[option])}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="library-toolbar__import"
        onClick={onImportGame}
        title={t('library.sidebarAdd')}
      >
        <span className="library-toolbar__import-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </span>
        <span className="library-toolbar__import-label">{t('library.sidebarAdd')}</span>
      </button>

      {onImportSteam ? (
        <button
          type="button"
          className="library-toolbar__import library-toolbar__import--steam"
          onClick={onImportSteam}
          title="Import from Steam"
        >
          <span className="library-toolbar__import-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false" fill="currentColor" stroke="none">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="8" cy="15" r="2.5" />
              <circle cx="16" cy="9" r="2" />
              <line x1="8" y1="15" x2="16" y2="9" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </span>
          <span className="library-toolbar__import-label">Steam</span>
        </button>
      ) : null}
    </div>
  )
}
